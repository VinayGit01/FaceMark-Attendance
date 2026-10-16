// Accounts, roles and extra permissions. Needs users.manage, and every change also needs a fresh face scan.
const router = require('express').Router();
const { body } = require('express-validator');
const User = require('../models/User');
const { protect, allow, requireFaceProof } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { normalizeMobile } = require('../utils/phone');
const { ROLES, VALID, catalog, effective } = require('../config/permissions');
const audit = require('../services/audit');

router.use(protect, allow('users.manage'));

const STAFF_ROLES = Object.keys(ROLES).filter((r) => ROLES[r].staff);
const shape = (u) => ({ ...u.toObject(), roleLabel: ROLES[u.role]?.label, permissions: effective(u) });

router.get('/catalog', (req, res) => res.json(catalog()));

router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.role ? { role: req.query.role } : {};
    const users = await User.find(filter).populate('person', 'name rollNo kind').sort({ createdAt: -1 });
    res.json({ users: users.map(shape) });
  } catch (err) { next(err); }
});

const needsDept = (role, dept) => ROLES[role].needsDepartment && !String(dept || '').trim();

router.post(
  '/',
  requireFaceProof,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Enter a valid email'),
    body('role').isIn(STAFF_ROLES).withMessage('Choose a staff role'),
    body('password').isLength({ min: 6 }).withMessage('Temporary password must be at least 6 characters'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { role, department } = req.body;
      if (role !== 'terminal' && !normalizeMobile(req.body.mobile)) return res.status(400).json({ message: 'Enter a valid mobile number' });
      if (needsDept(role, department)) return res.status(400).json({ message: `${ROLES[role].label} accounts must be limited to a department` });
      const user = await User.create({
        name: req.body.name, email: req.body.email, mobile: normalizeMobile(req.body.mobile) || undefined,
        password: req.body.password, role, department: ROLES[role].needsDepartment ? String(department).trim() : undefined,
        mustChangePassword: true,
      });
      audit(req, 'user.create', { targetType: 'user', targetId: user._id, targetName: user.name, meta: { role } });
      res.status(201).json({ user: shape(user) });
    } catch (err) { next(err); }
  }
);

// Self sign-up requests: approve picks the final role (and department for HOD / Faculty)
router.post('/:id/approve', requireFaceProof, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.status !== 'pending') return res.status(404).json({ message: 'No pending request found' });
    const role = req.body.role || 'faculty';
    if (!STAFF_ROLES.includes(role)) return res.status(400).json({ message: 'Choose a staff role' });
    if (needsDept(role, req.body.department)) return res.status(400).json({ message: `Enter the department for a ${ROLES[role].label}` });
    user.role = role;
    user.department = ROLES[role].needsDepartment ? String(req.body.department).trim() : undefined;
    user.status = 'active';
    await user.save();
    audit(req, 'user.approve', { targetType: 'user', targetId: user._id, targetName: user.name, meta: { role } });
    res.json({ user: shape(user) });
  } catch (err) { next(err); }
});

router.post('/:id/reject', requireFaceProof, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.status !== 'pending') return res.status(404).json({ message: 'No pending request found' });
    user.status = 'rejected';
    await user.save();
    audit(req, 'user.reject', { targetType: 'user', targetId: user._id, targetName: user.name });
    res.json({ user: shape(user) });
  } catch (err) { next(err); }
});

async function lastAdminGuard(target, res) {
  if (target.role === 'admin' && target.active && target.status === 'active' && (await User.countDocuments({ role: 'admin', active: true, status: 'active' })) <= 1) {
    res.status(400).json({ message: 'There must always be at least one active Super Admin' });
    return true;
  }
  return false;
}

router.patch('/:id', requireFaceProof, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const isSelf = String(user._id) === String(req.user._id);
    const before = { role: user.role, active: user.active, department: user.department };

    if (req.body.name) user.name = req.body.name;
    if (req.body.mobile) {
      const m = normalizeMobile(req.body.mobile);
      if (!m) return res.status(400).json({ message: 'Enter a valid mobile number' });
      user.mobile = m;
    }
    if (req.body.role && req.body.role !== user.role) {
      if (isSelf) return res.status(400).json({ message: 'You cannot change your own role' });
      if (!ROLES[user.role].staff || !STAFF_ROLES.includes(req.body.role)) {
        return res.status(400).json({ message: 'Student and employee sign-ins keep their role. Roles only change between staff roles.' });
      }
      if (await lastAdminGuard(user, res)) return;
      user.role = req.body.role;
    }
    if (req.body.department !== undefined && ROLES[user.role].needsDepartment) user.department = String(req.body.department).trim();
    if (ROLES[user.role].needsDepartment && !user.department) return res.status(400).json({ message: 'This role must be limited to a department' });
    if (!ROLES[user.role].needsDepartment && ROLES[user.role].staff) user.department = undefined;

    if (typeof req.body.active === 'boolean' && req.body.active !== user.active) {
      if (isSelf) return res.status(400).json({ message: 'You cannot disable your own account' });
      if (!req.body.active && (await lastAdminGuard(user, res))) return;
      user.active = req.body.active;
    }
    await user.save();
    audit(req, 'user.update', { targetType: 'user', targetId: user._id, targetName: user.name, meta: { before, after: { role: user.role, active: user.active, department: user.department } } });
    res.json({ user: shape(user) });
  } catch (err) { next(err); }
});

// Extra permissions on top of the role. Biometric ones are only ever given here, explicitly.
router.put('/:id/permissions', requireFaceProof, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const granted = Array.isArray(req.body.granted) ? [...new Set(req.body.granted)] : null;
    if (!granted || granted.some((p) => !VALID.has(p))) return res.status(400).json({ message: 'Unknown permission in the list' });
    const before = user.grantedPermissions;
    user.grantedPermissions = granted;
    await user.save();
    audit(req, 'user.permissions', { targetType: 'user', targetId: user._id, targetName: user.name, meta: { before, after: granted } });
    res.json({ user: shape(user) });
  } catch (err) { next(err); }
});

router.post('/:id/reset-face', requireFaceProof, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('+faceDescriptors');
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.faceDescriptors = [];
    user.faceEnrolled = false;
    user.faceFailures = 0;
    user.faceLockedUntil = undefined;
    await user.save();
    audit(req, 'user.reset_face', { targetType: 'user', targetId: user._id, targetName: user.name });
    res.json({ message: 'Face removed. They will register a new one at next sign-in.' });
  } catch (err) { next(err); }
});

router.post(
  '/:id/reset-password',
  requireFaceProof,
  [body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      user.password = req.body.password;
      user.mustChangePassword = true;
      user.passwordChangedAt = new Date();
      await user.save();
      audit(req, 'user.password_reset', { targetType: 'user', targetId: user._id, targetName: user.name });
      res.json({ message: 'Temporary password set. The user must change it at next sign-in.' });
    } catch (err) { next(err); }
  }
);

router.delete('/:id', requireFaceProof, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (String(user._id) === String(req.user._id)) return res.status(400).json({ message: 'You cannot delete your own account' });
    if (await lastAdminGuard(user, res)) return;
    await user.deleteOne();
    audit(req, 'user.delete', { targetType: 'user', targetId: user._id, targetName: user.name, meta: { role: user.role } });
    res.json({ message: 'User removed' });
  } catch (err) { next(err); }
});

module.exports = router;
