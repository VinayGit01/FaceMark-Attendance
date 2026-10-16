// Attendance correction requests: a person asks, the right reviewer (HR for employees, HOD/faculty for students) decides.
const router = require('express').Router();
const { body } = require('express-validator');
const Correction = require('../models/Correction');
const Student = require('../models/Student');
const Settings = require('../models/Settings');
const { protect, allow } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { personFilter, inScope } = require('../config/permissions');
const { applyManual } = require('../services/scanService');
const { isDay, nowInfo, addDays } = require('../utils/time');
const audit = require('../services/audit');

router.use(protect);
const REVIEW = ['corrections.review'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.state) filter.state = req.query.state;
    if (req.user.person) filter.student = req.user.person;
    else {
      const scope = personFilter(req.user, REVIEW);
      if (!scope) return res.status(403).json({ message: 'You do not have permission to view correction requests' });
      filter.student = { $in: await Student.find(scope).distinct('_id') };
    }
    const items = await Correction.find(filter).populate('student', 'name rollNo department kind').populate('reviewedBy', 'name').sort({ createdAt: -1 }).limit(300);
    res.json({ corrections: items });
  } catch (err) { next(err); }
});

router.post(
  '/',
  [
    body('date').custom(isDay).withMessage('Choose the date to correct'),
    body('status').isIn(['present', 'late', 'half-day']).withMessage('Choose the status you should have had'),
    body('reason').trim().isLength({ min: 5 }).withMessage('Give a reason (at least 5 characters)'),
    body('checkIn').optional({ values: 'falsy' }).matches(HHMM).withMessage('Check-in must look like 09:15'),
    body('checkOut').optional({ values: 'falsy' }).matches(HHMM).withMessage('Check-out must look like 17:30'),
  ],
  validate,
  async (req, res, next) => {
    try {
      if (!req.user.person) return res.status(403).json({ message: 'Only students and employees can request a correction for themselves' });
      const settings = await Settings.get();
      const today = nowInfo(settings.timezone).date;
      const { date, status, checkIn, checkOut, reason } = req.body;
      if (date > today) return res.status(400).json({ message: 'You cannot correct a future date' });
      if (date < addDays(today, -30)) return res.status(400).json({ message: 'Corrections can only be requested for the last 30 days' });
      if (checkIn && checkOut && checkOut <= checkIn) return res.status(400).json({ message: 'Check-out must be after check-in' });
      if (await Correction.exists({ student: req.user.person, date, state: 'pending' })) {
        return res.status(409).json({ message: 'You already have a pending request for that date' });
      }
      const c = await Correction.create({ student: req.user.person, date, status, checkIn: checkIn || undefined, checkOut: checkOut || undefined, reason, requestedBy: req.user._id });
      audit(req, 'correction.request', { targetType: 'correction', targetId: c._id, meta: { date, status } });
      res.status(201).json({ correction: c });
    } catch (err) { next(err); }
  }
);

router.patch('/:id/review', allow('corrections.review'), async (req, res, next) => {
  try {
    const { state, note } = req.body;
    if (!['approved', 'rejected'].includes(state)) return res.status(400).json({ message: 'Decision must be approved or rejected' });
    const c = await Correction.findById(req.params.id);
    const person = c && (await Student.findById(c.student));
    if (!person || !inScope(req.user, REVIEW, person)) return res.status(404).json({ message: 'Request not found' });
    if (c.state !== 'pending') return res.status(409).json({ message: 'This request was already decided' });

    if (state === 'approved') {
      const r = await applyManual({ studentId: c.student, date: c.date, status: c.status, checkIn: c.checkIn, checkOut: c.checkOut, note: `Correction approved: ${c.reason}`, userId: req.user._id });
      if (r.error) return res.status(400).json({ message: r.error });
    }
    c.state = state;
    c.reviewNote = note || '';
    c.reviewedBy = req.user._id;
    c.reviewedAt = new Date();
    await c.save();
    audit(req, 'correction.review', { targetType: person.kind, targetId: person._id, targetName: person.name, meta: { state, date: c.date } });
    res.json({ correction: c });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const c = await Correction.findById(req.params.id);
    if (!c || String(c.student) !== String(req.user.person) || c.state !== 'pending') {
      return res.status(403).json({ message: 'You can only cancel your own pending requests' });
    }
    await c.deleteOne();
    res.json({ message: 'Request cancelled' });
  } catch (err) { next(err); }
});

module.exports = router;
