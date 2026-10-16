// Attendance. Every read and write is limited to the people the caller's role (plus any grants) allows.
const router = require('express').Router();
const { body } = require('express-validator');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Leave = require('../models/Leave');
const Correction = require('../models/Correction');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { protect, allow } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { buildRange, summarize } = require('../services/attendanceService');
const { processScan, applyManual } = require('../services/scanService');
const { identify, validDescriptor } = require('../services/faceService');
const { personFilter, inScope, can } = require('../config/permissions');
const audit = require('../services/audit');
const { hhmm, nowInfo, isDay, addDays, weekRange, monthRange } = require('../utils/time');

router.use(protect);

const VIEW = ['attendance.view', 'attendance.edit'];
const EDIT = ['attendance.edit'];
const noAccess = (res) => res.status(403).json({ message: 'You do not have permission to view this' });
const idsIn = async (filter) => (filter ? Student.find(filter).distinct('_id') : []);

/* ---------- Terminal: the camera sends ONE fresh face descriptor; the server decides who it is ---------- */
router.post('/recognize', allow('attendance.terminal'), async (req, res, next) => {
  try {
    if (!validDescriptor(req.body.descriptor)) return res.status(400).json({ message: 'Invalid face data' });
    const settings = await Settings.get();
    const m = await identify(req.body.descriptor, settings.matchThreshold);
    if (!m.match) return res.json({ action: m.ambiguous ? 'ambiguous' : 'unknown' });
    const r = await processScan({ personId: m.id, mode: req.body.mode, confidence: Math.max(0, 1 - m.distance), userId: req.user._id, settings });
    res.status(r.code).json(r.body);
  } catch (err) { next(err); }
});

/* ---------- Manual add / correct (only for people inside the caller's edit scope) ---------- */
router.post(
  '/manual',
  allow('attendance.edit'),
  [
    body('studentId').notEmpty().withMessage('studentId is required'),
    body('date').custom(isDay).withMessage('date must be YYYY-MM-DD'),
    body('status').isIn(['present', 'late', 'half-day', 'absent']).withMessage('Choose a valid status'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { studentId, date, status, checkIn, checkOut, note } = req.body;
      const person = await Student.findById(studentId);
      if (!person || !inScope(req.user, EDIT, person)) return res.status(404).json({ message: 'Person not found' });
      const r = await applyManual({ studentId, date, status, checkIn, checkOut, note, userId: req.user._id });
      if (r.error) return res.status(400).json({ message: r.error });
      audit(req, 'attendance.edit', { targetType: person.kind, targetId: person._id, targetName: person.name, meta: { date, status } });
      res.json(r.removed ? { message: 'Marked absent' } : { record: r.record });
    } catch (err) { next(err); }
  }
);

/* ---------- One day ---------- */
router.get('/day/:date', async (req, res, next) => {
  try {
    const { date } = req.params;
    if (!isDay(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    const filter = personFilter(req.user, VIEW);
    if (!filter) return noAccess(res);
    const settings = await Settings.get();
    const people = await Student.find(filter).sort({ name: 1 });
    const map = await buildRange(people, date, date, settings);
    const rows = people.map((s) => {
      const d = (map.get(String(s._id)) || [])[0] || { status: 'absent' };
      return { student: { _id: s._id, kind: s.kind, name: s.name, rollNo: s.rollNo, department: s.department }, ...d, canEdit: inScope(req.user, EDIT, s) };
    });
    res.json({ date, rows });
  } catch (err) { next(err); }
});

/* ---------- Reports: daily | weekly | monthly (or custom from/to) ---------- */
router.get('/report', allow('reports.view'), async (req, res, next) => {
  try {
    const filter = personFilter(req.user, ['reports.view']);
    const settings = await Settings.get();
    const today = nowInfo(settings.timezone).date;
    const date = isDay(req.query.date) ? req.query.date : today;
    const period = req.query.period || 'daily';

    let range;
    if (period === 'weekly') range = weekRange(date);
    else if (period === 'monthly') range = monthRange(date);
    else if (period === 'custom' && isDay(req.query.from) && isDay(req.query.to)) range = { from: req.query.from, to: req.query.to };
    else range = { from: date, to: date };
    if (range.to < range.from) return res.status(400).json({ message: 'End date cannot be before start date' });
    if (addDays(range.from, 366) < range.to) return res.status(400).json({ message: 'Choose a range of one year or less' });

    const people = await Student.find(filter).sort({ name: 1 });
    const map = await buildRange(people, range.from, range.to, settings);
    const rows = people.map((s) => ({
      student: { _id: s._id, kind: s.kind, name: s.name, rollNo: s.rollNo, department: s.department },
      summary: summarize(map.get(String(s._id)) || []),
    }));
    const totals = rows.reduce((t, r) => {
      ['present', 'late', 'halfDay', 'leave', 'absent', 'totalMinutes'].forEach((k) => (t[k] += r.summary[k]));
      return t;
    }, { present: 0, late: 0, halfDay: 0, leave: 0, absent: 0, totalMinutes: 0 });
    audit(req, 'report.view', { meta: { period, from: range.from, to: range.to, people: rows.length } });
    res.json({ period, ...range, rows, totals });
  } catch (err) { next(err); }
});

/* ---------- One person's history (staff view; each look is logged) ---------- */
router.get('/history/:studentId', async (req, res, next) => {
  try {
    const filter = personFilter(req.user, ['attendance.view', 'reports.view', 'attendance.edit']);
    if (!filter) return noAccess(res);
    const settings = await Settings.get();
    const today = nowInfo(settings.timezone).date;
    const to = isDay(req.query.to) ? req.query.to : today;
    const from = isDay(req.query.from) ? req.query.from : addDays(to, -29);
    if (to < from) return res.status(400).json({ message: 'End date cannot be before start date' });
    if (addDays(from, 366) < to) return res.status(400).json({ message: 'Choose a range of one year or less' });

    const person = await Student.findOne({ $and: [{ _id: req.params.studentId }, filter] });
    if (!person) return res.status(404).json({ message: 'Person not found' });
    const days = (await buildRange([person], from, to, settings)).get(String(person._id)) || [];
    audit(req, 'history.view', { targetType: person.kind, targetId: person._id, targetName: person.name, meta: { from, to } });
    res.json({ student: { _id: person._id, kind: person.kind, name: person.name, rollNo: person.rollNo, department: person.department }, from, to, summary: summarize(days), days: [...days].reverse() });
  } catch (err) { next(err); }
});

/* ---------- Operational dashboard (only the caller's own scope) ---------- */
router.get('/stats/summary', async (req, res, next) => {
  try {
    const filter = personFilter(req.user, VIEW);
    if (!filter) return noAccess(res);
    const settings = await Settings.get();
    const tz = settings.timezone;
    const today = nowInfo(tz).date;

    const people = await Student.find(filter).select('_id createdAt faceCount kind');
    const ids = people.map((p) => p._id);
    const map = await buildRange(people, today, today, settings);
    const c = { present: 0, late: 0, halfDay: 0, leave: 0, absent: 0, checkedIn: 0, checkedOut: 0 };
    for (const days of map.values()) {
      const d = days[0];
      if (!d) continue;
      if (d.status === 'present') c.present++;
      else if (d.status === 'late') c.late++;
      else if (d.status === 'half-day') c.halfDay++;
      else if (d.status === 'leave') c.leave++;
      else if (d.status === 'absent') c.absent++;
      if (d.checkInTime) c.checkedIn++;
      if (d.checkOutTime) c.checkedOut++;
    }

    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const week = await Attendance.aggregate([
      { $match: { date: { $in: weekDays }, student: { $in: ids } } },
      { $group: { _id: '$date', count: { $sum: 1 } } },
    ]);
    const weekMap = Object.fromEntries(week.map((w) => [w._id, w.count]));
    const recentRaw = await Attendance.find({ date: today, student: { $in: ids } }).populate('student', 'name rollNo').sort({ updatedAt: -1 }).limit(8);
    const recent = recentRaw.map((r) => ({ _id: r._id, student: r.student, status: r.status, action: r.checkOut ? 'check-out' : 'check-in', time: hhmm(r.checkOut || r.checkIn, tz) }));

    const leaveIds = await idsIn(personFilter(req.user, ['leaves.review']));
    const corrIds = await idsIn(personFilter(req.user, ['corrections.review']));
    const attended = c.present + c.late + c.halfDay;
    res.json({
      today, totalStudents: people.length, enrolledFaces: people.filter((s) => s.faceCount > 0).length, ...c,
      rules: { lateAfter: settings.lateAfter, checkOutTime: settings.checkOutTime, allowEarlyCheckout: settings.allowEarlyCheckout },
      rate: people.length ? Math.round((attended / people.length) * 100) : 0,
      week: weekDays.map((d) => ({ date: d, count: weekMap[d] || 0 })), recent,
      pendingLeaves: leaveIds.length ? await Leave.countDocuments({ status: 'pending', student: { $in: leaveIds } }) : 0,
      pendingCorrections: corrIds.length ? await Correction.countDocuments({ state: 'pending', student: { $in: corrIds } }) : 0,
      pendingSignups: can(req.user, 'users.manage') ? await User.countDocuments({ status: 'pending' }) : 0,
    });
  } catch (err) { next(err); }
});

router.delete('/:id', allow('attendance.edit'), async (req, res, next) => {
  try {
    const rec = await Attendance.findById(req.params.id).populate('student');
    if (!rec || !rec.student || !inScope(req.user, EDIT, rec.student)) return res.status(404).json({ message: 'Record not found' });
    await rec.deleteOne();
    audit(req, 'attendance.delete', { targetType: rec.student.kind, targetId: rec.student._id, targetName: rec.student.name, meta: { date: rec.date } });
    res.json({ message: 'Record removed' });
  } catch (err) { next(err); }
});

module.exports = router;
