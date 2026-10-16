const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const User = require('../models/User');
const OtpToken = require('../models/OtpToken');
const { protect } = require('../middleware/auth');
const { ROLES, effective } = require('../config/permissions');
const audit = require('../services/audit');
const { validate } = require('../middleware/error');
const { sendSms } = require('../config/sms');
const { normalizeMobile } = require('../utils/phone');
const { cleanDescriptors, consistent, faceRequired, proofMinutes } = require('../utils/face');
const { verifyUserFace } = require('../services/faceAuth');

const OTP_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 5);
const RESEND_SECONDS = 30;
const MAX_ATTEMPTS = 5;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Try again in a few minutes.' },
  validate: { xForwardedForHeader: false }, // the Vite dev proxy adds this header
});

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
const signPurpose = (id, purpose, expiresIn) => jwt.sign({ id, purpose }, process.env.JWT_SECRET, { expiresIn });
const payload = (u) => ({
  id: u._id, name: u.name, email: u.email, mobile: u.mobile, role: u.role,
  roleLabel: ROLES[u.role]?.label || u.role, department: u.department, person: u.person || null,
  permissions: effective(u), mustChangePassword: !!u.mustChangePassword,
});
const hashOtp = (mobile, otp) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${mobile}:${otp}`).digest('hex');
const showDevOtp = () => (process.env.SMS_PROVIDER || 'console') === 'console' && process.env.NODE_ENV !== 'production';

const checkEnrolment = (list) => {
  const d = cleanDescriptors(list, 3, 8);
  if (!d) return { error: 'Face enrolment needs 3 to 8 clear face samples.' };
  if (!consistent(d)) return { error: 'The face samples did not look like one person. Try again.' };
  return { descriptors: d };
};

router.get('/config', (req, res) => res.json({ faceRequired: faceRequired(), proofMinutes: proofMinutes() }));

router.get('/setup-status', async (req, res, next) => {
  try {
    res.json({ needsSetup: (await User.countDocuments()) === 0 });
  } catch (err) { next(err); }
});

const accountRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Enter a valid email'),
  body('mobile').custom((v) => !!normalizeMobile(v)).withMessage('Enter a valid mobile number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

/* ---------- First admin (only works on an empty database) ---------- */
router.post('/register', limiter, accountRules, validate, async (req, res, next) => {
  try {
    if ((await User.countDocuments()) > 0) {
      return res.status(403).json({ message: 'Setup is already done. Use "Request an account" instead.' });
    }
    const face = faceRequired() ? checkEnrolment(req.body.faceDescriptors) : { descriptors: undefined };
    if (face.error) return res.status(400).json({ message: face.error });

    const user = await User.create({
      name: req.body.name, email: req.body.email, mobile: normalizeMobile(req.body.mobile),
      password: req.body.password, role: 'admin', status: 'active',
      grantedPermissions: ['biometric.enroll', 'attendance.terminal'], // explicit grants a Super Admin can revoke later
      faceDescriptors: face.descriptors, faceEnrolled: !!face.descriptors,
    });
    audit(req, 'auth.setup', { actor: user._id, actorName: user.name, actorRole: 'admin' });
    res.status(201).json({ token: sign(user._id), user: payload(user) });
  } catch (err) { next(err); }
});

/* ---------- Self sign-up: face enrolled now, access only after an admin approves ---------- */
router.post('/signup', limiter, accountRules, validate, async (req, res, next) => {
  try {
    if ((await User.countDocuments()) === 0) return res.status(400).json({ message: 'Create the admin account first.' });
    const face = faceRequired() ? checkEnrolment(req.body.faceDescriptors) : { descriptors: undefined };
    if (face.error) return res.status(400).json({ message: face.error });

    await User.create({
      name: req.body.name, email: req.body.email, mobile: normalizeMobile(req.body.mobile),
      password: req.body.password, role: 'faculty', status: 'pending', // the admin picks the real role (and department) when approving
      faceDescriptors: face.descriptors, faceEnrolled: !!face.descriptors,
    });
    res.status(201).json({ message: 'Request sent. An admin must approve your account with a face scan before you can sign in.' });
  } catch (err) { next(err); }
});

/* ---------- Login: password first, then face ---------- */
router.post(
  '/login',
  limiter,
  [body('email').isEmail().withMessage('Enter a valid email'), body('password').notEmpty().withMessage('Password is required')],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findOne({ email: req.body.email }).select('+password +faceDescriptors');
      if (!user || !(await user.matchPassword(req.body.password))) {
        audit(req, 'auth.login_failed', { actorName: req.body.email, meta: { portal: req.body.portal } });
        return res.status(401).json({ message: 'Email or password is incorrect' });
      }
      if (user.status === 'pending') return res.status(403).json({ message: 'Your sign-up is waiting for admin approval.' });
      if (user.status === 'rejected') return res.status(403).json({ message: 'Your sign-up request was not approved.' });
      if (!user.active) return res.status(403).json({ message: 'This account is disabled. Contact your admin.' });

      // Two separate portals: students/employees and staff never sign in through the same door
      const portal = req.body.portal === 'member' ? 'member' : 'staff';
      if (ROLES[user.role]?.portal !== portal) {
        return res.status(403).json({
          message: portal === 'member'
            ? 'This sign-in is for students and employees. Staff should use the Staff and admin sign-in.'
            : 'Students and employees sign in through the Student / Employee portal.',
        });
      }

      if (!faceRequired()) {
        audit(req, 'auth.login', { actor: user._id, actorName: user.name, actorRole: user.role });
        return res.json({ token: sign(user._id), user: payload(user) });
      }

      if (user.faceLockedUntil && user.faceLockedUntil > new Date()) {
        const mins = Math.ceil((user.faceLockedUntil - Date.now()) / 60000);
        return res.status(429).json({ message: `Face sign-in is locked. Try again in ${mins} minute(s).` });
      }

      // Password alone never opens a session. It only earns a 5-minute pass to the face step.
      const hasFace = (user.faceDescriptors || []).length > 0;
      res.json({
        faceStep: hasFace ? 'verify' : 'enroll', // accounts made before face login (or by an admin) enrol on first sign-in
        faceToken: signPurpose(user._id, hasFace ? 'face-login' : 'face-enroll', '5m'),
      });
    } catch (err) { next(err); }
  }
);

const readFaceToken = (token, purpose) => {
  try {
    const d = jwt.verify(token || '', process.env.JWT_SECRET);
    return d.purpose === purpose ? d : null;
  } catch { return null; }
};
const expired = (res) => res.status(401).json({ message: 'Your sign-in timed out. Enter your password again.', code: 'FACE_TOKEN_EXPIRED' });

router.post('/face/login', limiter, async (req, res, next) => {
  try {
    const t = readFaceToken(req.body.faceToken, 'face-login');
    if (!t) return expired(res);
    const user = await User.findById(t.id).select('+faceDescriptors');
    if (!user || !user.active || user.status !== 'active') return expired(res);

    const result = await verifyUserFace(user, req.body.descriptors);
    if (!result.ok) {
      audit(req, 'auth.face_failed', { actor: user._id, actorName: user.name, actorRole: user.role });
      return res.status(result.status).json({ message: result.message, code: result.code });
    }
    audit(req, 'auth.login', { actor: user._id, actorName: user.name, actorRole: user.role, meta: { face: true } });
    res.json({ token: sign(user._id), user: payload(user) });
  } catch (err) { next(err); }
});

router.post('/face/enroll', limiter, async (req, res, next) => {
  try {
    const t = readFaceToken(req.body.faceToken, 'face-enroll');
    if (!t) return expired(res);
    const user = await User.findById(t.id).select('+faceDescriptors');
    if (!user || !user.active || user.status !== 'active') return expired(res);
    if ((user.faceDescriptors || []).length) return res.status(409).json({ message: 'A face is already enrolled for this account.' });

    const face = checkEnrolment(req.body.descriptors);
    if (face.error) return res.status(400).json({ message: face.error });
    user.faceDescriptors = face.descriptors;
    user.faceEnrolled = true;
    await user.save();
    audit(req, 'auth.face_enrolled', { actor: user._id, actorName: user.name, actorRole: user.role });
    res.json({ token: sign(user._id), user: payload(user) });
  } catch (err) { next(err); }
});

// An admin re-scans their face to unlock sensitive actions for a few minutes.
const staffOnly = (req, res, next) => (ROLES[req.user.role]?.staff ? next() : res.status(403).json({ message: 'Not available for this account' }));
router.post('/face/verify-admin', protect, staffOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+faceDescriptors');
    const result = await verifyUserFace(user, req.body.descriptors);
    if (!result.ok) return res.status(result.status).json({ message: result.message, code: result.code });
    const minutes = proofMinutes();
    res.json({ proof: signPurpose(user._id, 'admin-face', `${minutes}m`), expiresInSeconds: minutes * 60 });
  } catch (err) { next(err); }
});

router.get('/me', protect, (req, res) => res.json({ user: payload(req.user) }));

// Own profile: staff may change their name; everyone may change their mobile (needs the current password).
router.patch('/profile', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (req.body.name && ROLES[user.role].staff) user.name = String(req.body.name).trim();
    if (req.body.mobile) {
      const m = normalizeMobile(req.body.mobile);
      if (!m) return res.status(400).json({ message: 'Enter a valid mobile number' });
      if (m !== user.mobile) {
        if (!(await user.matchPassword(req.body.currentPassword || ''))) {
          return res.status(400).json({ message: 'Enter your current password to change your mobile number' });
        }
        user.mobile = m;
      }
    }
    await user.save();
    audit(req, 'profile.update', { targetType: 'user', targetId: user._id, targetName: user.name });
    res.json({ user: payload(user) });
  } catch (err) { next(err); }
});

router.post(
  '/change-password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Enter your current password'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id).select('+password');
      if (!(await user.matchPassword(req.body.currentPassword))) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      user.password = req.body.newPassword;
      user.mustChangePassword = false;
      user.passwordChangedAt = new Date();
      await user.save();
      audit(req, 'auth.password_change');
      res.json({ message: 'Password updated', token: sign(user._id), user: payload(user) });
    } catch (err) { next(err); }
  }
);

/* ---------- Forgot password with mobile OTP ---------- */
router.post('/forgot-password', limiter, async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body.mobile);
    if (!mobile) return res.status(400).json({ message: 'Enter a valid mobile number' });

    const generic = { message: 'If this number is registered, a code has been sent by SMS.', resendSeconds: RESEND_SECONDS };

    const user = await User.findOne({ mobile, active: true, status: 'active' });
    if (!user) return res.json(generic);

    const existing = await OtpToken.findOne({ mobile });
    if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_SECONDS * 1000) return res.json(generic);

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await OtpToken.findOneAndUpdate(
      { mobile },
      { codeHash: hashOtp(mobile, otp), attempts: 0, lastSentAt: new Date(), expiresAt: new Date(Date.now() + OTP_MINUTES * 60000) },
      { upsert: true }
    );

    try {
      await sendSms(mobile, `Your FaceMark password reset code is ${otp}. It expires in ${OTP_MINUTES} minutes. Do not share it with anyone.`, otp);
    } catch (e) {
      console.error('SMS failed:', e.message);
      await OtpToken.deleteOne({ mobile });
      return res.status(502).json({ message: 'Could not send the SMS right now. Please try again shortly.' });
    }

    res.json(showDevOtp() ? { ...generic, devOtp: otp } : generic);
  } catch (err) { next(err); }
});

router.post('/verify-otp', limiter, async (req, res, next) => {
  try {
    const mobile = normalizeMobile(req.body.mobile);
    const otp = String(req.body.otp || '').trim();
    if (!mobile || !/^\d{6}$/.test(otp)) return res.status(400).json({ message: 'Enter the 6-digit code' });

    const token = await OtpToken.findOne({ mobile });
    if (!token || token.expiresAt < new Date()) {
      return res.status(400).json({ message: 'This code has expired. Request a new one.' });
    }
    if (token.attempts >= MAX_ATTEMPTS) {
      await token.deleteOne();
      return res.status(429).json({ message: 'Too many wrong attempts. Request a new code.' });
    }

    const a = Buffer.from(token.codeHash);
    const b = Buffer.from(hashOtp(mobile, otp));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      token.attempts += 1;
      await token.save();
      return res.status(400).json({ message: `Incorrect code. ${MAX_ATTEMPTS - token.attempts} attempt(s) left.` });
    }

    await token.deleteOne();
    const user = await User.findOne({ mobile, active: true, status: 'active' });
    if (!user) return res.status(400).json({ message: 'Account not available' });
    res.json({ resetToken: signPurpose(user._id, 'reset', '10m') });
  } catch (err) { next(err); }
});

router.post(
  '/reset-password',
  limiter,
  [body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')],
  validate,
  async (req, res, next) => {
    try {
      const d = readFaceToken(req.body.resetToken, 'reset');
      if (!d) return res.status(400).json({ message: 'Reset session expired. Start again.' });

      const user = await User.findById(d.id);
      if (!user || !user.active || user.status !== 'active') return res.status(400).json({ message: 'Account not available' });

      user.password = req.body.newPassword;
      user.mustChangePassword = false;
      user.passwordChangedAt = new Date();
      await user.save();
      audit(req, 'auth.password_reset_otp', { actor: user._id, actorName: user.name, actorRole: user.role });
      res.json({ message: 'Password updated. You can sign in now.' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
