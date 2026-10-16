// "People": students (college) and employees (company). Every route is scoped by the caller's permissions.
const router = require('express').Router();
const { body } = require('express-validator');
const Student = require('../models/Student');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Correction = require('../models/Correction');
const { protect, allow, requireFaceProof } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { personFilter, inScope, can, escapeRx } = require('../config/permissions');
const { validDescriptor, invalidate } = require('../services/faceService');
const { normalizeMobile } = require('../utils/phone');
const audit = require('../services/audit');

router.use(protect);

// Everything that legitimately needs to list people (dropdowns, pickers)
const LIST_CAPS = ['people.view', 'people.manage', 'attendance.view', 'attendance.edit', 'reports.view', 'leaves.review', 'corrections.review'];
const MANAGE = ['people.manage'];

const validFaces = (arr) => Array.isArray(arr) && arr.length > 0 && arr.length <= 10 && arr.every(validDescriptor);

router.get('/', allow(...LIST_CAPS), async (req, res, next) => {
  try {
    const scope = personFilter(req.user, LIST_CAPS);
    const filter = { $and: [scope] };
    if (req.query.kind) filter.$and.push({ kind: req.query.kind });
    if (req.query.q) {
      const rx = new RegExp(escapeRx(req.query.q), 'i');
      filter.$and.push({ $or: [{ name: rx }, { rollNo: rx }, { department: rx }] });
    }
    const people = await Student.find(filter).sort({ name: 1 });
    const logins = await User.find({ person: { $in: people.map((p) => p._id) } }).select('person active');
    const loginMap = new Map(logins.map((l) => [String(l.person), l]));

    res.json({
      people: people.map((p) => {
        const full = inScope(req.user, ['people.view', 'people.manage'], p);
        const lg = loginMap.get(String(p._id));
        return {
          _id: p._id, kind: p.kind, name: p.name, rollNo: p.rollNo, department: p.department,
          className: p.className, faceCount: p.faceCount, hasLogin: !!lg, loginActive: lg?.active,
          email: full ? p.email : undefined, // contact details only for those allowed to view profiles
          canManage: inScope(req.user, MANAGE, p),
        };
      }),
    });
  } catch (err) { next(err); }
});

router.post(
  '/',
  allow('people.manage'),
  [
    body('kind').isIn(['student', 'employee']).withMessage('Choose student or employee'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('rollNo').trim().notEmpty().withMessage('ID / roll number is required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { kind, name, rollNo, email, department, className, faceDescriptors } = req.body;
      const draft = { kind, department: department || 'General' };
      if (!inScope(req.user, MANAGE, draft)) return res.status(403).json({ message: 'You cannot add this kind of person or department' });

      const withFaces = faceDescriptors !== undefined && faceDescriptors !== null && faceDescriptors.length !== 0;
      if (withFaces) {
        if (!can(req.user, 'biometric.enroll')) return res.status(403).json({ message: 'You are not authorised to capture face data' });
        if (!validFaces(faceDescriptors)) return res.status(400).json({ message: 'Face samples are invalid' });
      }

      const person = await Student.create({
        kind, name, rollNo, email, department: draft.department, className,
        faceDescriptors: withFaces ? faceDescriptors : [], faceCount: withFaces ? faceDescriptors.length : 0,
        createdBy: req.user._id,
      });
      if (withFaces) invalidate();
      audit(req, 'person.create', { targetType: kind, targetId: person._id, targetName: name, meta: { department: draft.department } });
      if (withFaces) audit(req, 'biometric.enroll', { targetType: kind, targetId: person._id, targetName: name, meta: { samples: faceDescriptors.length } });

      const out = person.toObject();
      delete out.faceDescriptors;
      res.status(201).json({ person: out });
    } catch (err) { next(err); }
  }
);

router.put('/:id', allow('people.manage'), async (req, res, next) => {
  try {
    const person = await Student.findById(req.params.id);
    if (!person || !inScope(req.user, MANAGE, person)) return res.status(404).json({ message: 'Person not found' });

    const next_ = { kind: person.kind, department: person.department };
    ['name', 'rollNo', 'email', 'department', 'className'].forEach((k) => { if (req.body[k] !== undefined) person[k] = req.body[k]; });
    next_.department = person.department;
    if (!inScope(req.user, MANAGE, next_)) return res.status(403).json({ message: 'You cannot move this person outside your own scope' });

    await person.save();
    audit(req, 'person.update', { targetType: person.kind, targetId: person._id, targetName: person.name });
    res.json({ person });
  } catch (err) { next(err); }
});

// Replace face samples. Needs the separate biometric.enroll permission AND access to that person.
router.put('/:id/face', allow('biometric.enroll'), requireFaceProof, async (req, res, next) => {
  try {
    const person = await Student.findById(req.params.id);
    if (!person || !inScope(req.user, ['people.view', 'people.manage'], person)) return res.status(404).json({ message: 'Person not found' });
    if (!validFaces(req.body.faceDescriptors)) return res.status(400).json({ message: 'Face samples are invalid' });
    person.faceDescriptors = req.body.faceDescriptors;
    person.faceCount = req.body.faceDescriptors.length;
    await person.save();
    invalidate();
    audit(req, 'biometric.enroll', { targetType: person.kind, targetId: person._id, targetName: person.name, meta: { samples: person.faceCount, replaced: true } });
    res.json({ faceCount: person.faceCount });
  } catch (err) { next(err); }
});

// Give a student / employee their own sign-in (a Super Admin, or whoever manages that person)
router.post(
  '/:id/login',
  requireFaceProof,
  [
    body('email').isEmail().withMessage('Enter a valid email'),
    body('mobile').custom((v) => !!normalizeMobile(v)).withMessage('Enter a valid mobile number'),
    body('password').isLength({ min: 6 }).withMessage('Temporary password must be at least 6 characters'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const person = await Student.findById(req.params.id);
      const allowed = person && (can(req.user, 'users.manage') || inScope(req.user, MANAGE, person));
      if (!allowed) return res.status(404).json({ message: 'Person not found' });
      if (await User.exists({ person: person._id })) return res.status(409).json({ message: 'This person already has a sign-in' });

      const user = await User.create({
        name: person.name, email: req.body.email, mobile: normalizeMobile(req.body.mobile),
        password: req.body.password, role: person.kind, person: person._id, mustChangePassword: true,
      });
      audit(req, 'user.create', { targetType: 'user', targetId: user._id, targetName: user.name, meta: { role: user.role, linkedTo: person.rollNo } });
      res.status(201).json({ message: 'Sign-in created. They must choose their own password at first sign-in.' });
    } catch (err) { next(err); }
  }
);

router.delete('/:id', allow('people.manage'), async (req, res, next) => {
  try {
    const person = await Student.findById(req.params.id);
    if (!person || !inScope(req.user, MANAGE, person)) return res.status(404).json({ message: 'Person not found' });
    await Promise.all([
      Attendance.deleteMany({ student: person._id }), Leave.deleteMany({ student: person._id }),
      Correction.deleteMany({ student: person._id }), User.deleteMany({ person: person._id }), person.deleteOne(),
    ]);
    invalidate();
    audit(req, 'person.delete', { targetType: person.kind, targetId: person._id, targetName: person.name });
    res.json({ message: 'Removed, along with their attendance, leave and sign-in' });
  } catch (err) { next(err); }
});

module.exports = router;
