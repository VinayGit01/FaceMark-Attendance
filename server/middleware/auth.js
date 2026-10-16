const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { can, ROLES } = require('../config/permissions');
const { faceRequired } = require('../utils/face');

exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Not signed in' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose) return res.status(401).json({ message: 'Invalid session' });

    const user = await User.findById(decoded.id);
    if (!user || !user.active || user.status !== 'active' || !ROLES[user.role]) {
      return res.status(401).json({ message: 'Account is not available' });
    }
    if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      return res.status(401).json({ message: 'Password changed. Please sign in again.' });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }
};

// allow('users.manage')  or  allow('people.view', 'people.manage')  -> passes if the user has ANY of them (any scope)
exports.allow = (...keys) => (req, res, next) => {
  if (keys.some((k) => can(req.user, k))) return next();
  res.status(403).json({ message: 'You do not have permission to do this' });
};

// Student / Employee self-service routes
exports.personOnly = (req, res, next) => {
  if (!req.user.person) return res.status(403).json({ message: 'This area is for students and employees' });
  next();
};

// Sensitive actions need a fresh face scan of the person doing them ("x-face-proof" header, issued by /auth/face/verify-admin).
exports.requireFaceProof = (req, res, next) => {
  if (!faceRequired()) return next();
  const need = (message) => res.status(403).json({ message, code: 'FACE_PROOF_REQUIRED' });
  try {
    const d = jwt.verify(req.headers['x-face-proof'] || '', process.env.JWT_SECRET);
    if (d.purpose !== 'admin-face' || String(d.id) !== String(req.user._id)) return need('Scan your face to confirm this action.');
    next();
  } catch {
    need('Scan your face to confirm this action.');
  }
};
