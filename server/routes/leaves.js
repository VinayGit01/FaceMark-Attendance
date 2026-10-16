const router = require('express').Router();
const { body } = require('express-validator');
const Leave = require('../models/Leave');
const Student = require('../models/Student');
const { protect, allow } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { personFilter, inScope } = require('../config/permissions');
const { isDay } = require('../utils/time');
const audit = require('../services/audit');

router.use(protect);
const REVIEW = ['leaves.review'];

// Students / employees see only their own requests; staff see only the people in their scope.
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.user.person) filter.student = req.user.person;
    else {
      const scope = personFilter(req.user, REVIEW);
      if (!scope) return res.status(403).json({ message: 'You do not have permission to view leave requests' });
      filter.student = { $in: await Student.find(scope).distinct('_id') };
    }
    const leaves = await Leave.find(filter).populate('student', 'name rollNo department kind').populate('reviewedBy', 'name').sort({ createdAt: -1 }).limit(500);
    res.json({ leaves });
  } catch (err) { next(err); }
});

router.post(
  '/',
  [
    body('fromDate').custom(isDay).withMessage('From date is required'),
    body('toDate').custom(isDay).withMessage('To date is required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { fromDate, toDate, type, reason } = req.body;
      if (toDate < fromDate) return res.status(400).json({ message: 'To date cannot be before from date' });

      let studentId;
      if (req.user.person) studentId = req.user.person; // you can only request leave for yourself
      else {
        const person = await Student.findById(req.body.studentId);
        if (!person || !inScope(req.user, REVIEW, person)) return res.status(404).json({ message: 'Person not found' });
        studentId = person._id;
      }
      const clash = await Leave.findOne({ student: studentId, status: { $in: ['pending', 'approved'] }, fromDate: { $lte: toDate }, toDate: { $gte: fromDate } });
      if (clash) return res.status(409).json({ message: 'There is already a leave request on those dates' });

      const leave = await Leave.create({ student: studentId, fromDate, toDate, type, reason, requestedBy: req.user._id });
      audit(req, 'leave.request', { targetType: 'leave', targetId: leave._id, meta: { fromDate, toDate, onBehalf: !req.user.person } });
      res.status(201).json({ leave });
    } catch (err) { next(err); }
  }
);

router.patch('/:id/review', allow('leaves.review'), async (req, res, next) => {
  try {
    const { status, note } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Status must be approved or rejected' });
    const leave = await Leave.findById(req.params.id);
    const person = leave && (await Student.findById(leave.student));
    if (!person || !inScope(req.user, REVIEW, person)) return res.status(404).json({ message: 'Leave request not found' });
    leave.status = status;
    leave.reviewNote = note || '';
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    await leave.save();
    audit(req, 'leave.review', { targetType: person.kind, targetId: person._id, targetName: person.name, meta: { status, fromDate: leave.fromDate, toDate: leave.toDate } });
    res.json({ leave });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave request not found' });
    if (req.user.person) {
      if (String(leave.student) !== String(req.user.person) || leave.status !== 'pending') return res.status(403).json({ message: 'You can only cancel your own pending requests' });
    } else {
      const person = await Student.findById(leave.student);
      if (!person || !inScope(req.user, REVIEW, person)) return res.status(404).json({ message: 'Leave request not found' });
    }
    await leave.deleteOne();
    audit(req, 'leave.delete', { targetType: 'leave', targetId: leave._id });
    res.json({ message: 'Leave request removed' });
  } catch (err) { next(err); }
});

module.exports = router;
