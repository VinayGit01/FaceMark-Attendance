// Self-service for students and employees. Everything here is about the signed-in person only.
const router = require('express').Router();
const Student = require('../models/Student');
const Settings = require('../models/Settings');
const { protect, personOnly } = require('../middleware/auth');
const { buildRange, summarize } = require('../services/attendanceService');
const { processScan } = require('../services/scanService');
const { verify, readScan } = require('../services/faceService');
const { nowInfo, isDay, addDays } = require('../utils/time');
const audit = require('../services/audit');

router.use(protect, personOnly);

router.get('/overview', async (req, res, next) => {
  try {
    const person = await Student.findById(req.user.person);
    if (!person) return res.status(404).json({ message: 'Your record was not found. Contact your admin.' });
    const settings = await Settings.get();
    const today = nowInfo(settings.timezone).date;
    const to = isDay(req.query.to) ? req.query.to : today;
    const from = isDay(req.query.from) ? req.query.from : addDays(to, -29);
    if (to < from || addDays(from, 366) < to) return res.status(400).json({ message: 'Choose a valid range of one year or less' });

    const days = (await buildRange([person], from, to, settings)).get(String(person._id)) || [];
    const todayDay = ((await buildRange([person], today, today, settings)).get(String(person._id)) || [])[0] || null;
    res.json({
      person: { name: person.name, rollNo: person.rollNo, kind: person.kind, department: person.department, className: person.className },
      today: todayDay, from, to, summary: summarize(days), days: [...days].reverse(),
      rules: { lateAfter: settings.lateAfter, checkOutTime: settings.checkOutTime },
      canSelfMark: settings.selfMarking && person.faceCount > 0,
    });
  } catch (err) { next(err); }
});

// Mark your OWN attendance: the server checks the face against your own enrolled face (1:1) before recording anything.
router.post('/mark', async (req, res, next) => {
  try {
    const settings = await Settings.get();
    if (!settings.selfMarking) return res.status(403).json({ message: 'Self-marking is switched off. Use the attendance terminal.' });
    const scan = readScan(req.body);
    if (scan.invalid) return res.status(400).json({ message: 'Invalid face data' });
    if (scan.unsteady) return res.status(400).json({ message: 'The view was unsteady. Hold still and try again.' });
    const v = await verify(req.user.person, scan.descriptor, settings.matchThreshold);
    if (v.noFace) return res.status(409).json({ message: 'No face is enrolled for you yet. Ask your admin or HR.' });
    if (!v.match) {
      audit(req, 'attendance.self_mark_rejected', { targetType: 'self' });
      return res.status(401).json({ message: 'Your face did not match. Try again in good light.' });
    }
    const r = await processScan({ personId: req.user.person, mode: req.body.mode || 'auto', confidence: Math.max(0, 1 - v.distance), userId: req.user._id, settings });
    audit(req, 'attendance.self_mark', { targetType: 'self', meta: { action: r.body.action } });
    res.status(r.code).json(r.body);
  } catch (err) { next(err); }
});

module.exports = router;
