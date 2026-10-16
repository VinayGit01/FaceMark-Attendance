const router = require('express').Router();
const Settings = require('../models/Settings');
const { protect, requireFaceProof } = require('../middleware/auth');
const { can } = require('../config/permissions');
const { validTimezone } = require('../utils/time');
const audit = require('../services/audit');

router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    res.json({ settings: await Settings.get() });
  } catch (err) { next(err); }
});

const RULE_KEYS = ['lateAfter', 'checkOutTime', 'allowEarlyCheckout', 'halfDayBelowHours', 'minCheckoutGapMinutes', 'weekOffDays', 'timezone'];
const BIO_KEYS = ['matchThreshold', 'selfMarking'];

router.put('/', async (req, res, next) => {
  try {
    const touchesRules = RULE_KEYS.some((k) => req.body[k] !== undefined);
    const touchesBio = BIO_KEYS.some((k) => req.body[k] !== undefined);
    if (touchesRules && !can(req.user, 'settings.manage')) return res.status(403).json({ message: 'You cannot change attendance rules' });
    if (touchesBio && !can(req.user, 'biometric.settings')) return res.status(403).json({ message: 'You are not authorised to change face recognition settings' });
    if (!touchesRules && !touchesBio) return res.status(400).json({ message: 'Nothing to change' });
    // biometric changes also need a fresh face scan
    if (touchesBio) {
      let proofOk = false;
      await new Promise((resolve) => requireFaceProof(req, { status: () => ({ json: () => resolve() }) }, () => { proofOk = true; resolve(); }));
      if (!proofOk) return res.status(403).json({ message: 'Scan your face to confirm this action.', code: 'FACE_PROOF_REQUIRED' });
    }

    const s = await Settings.get();
    const before = s.toObject();
    const b = req.body;
    if (b.lateAfter !== undefined) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.lateAfter)) return res.status(400).json({ message: 'Late time must look like 09:30' });
      s.lateAfter = b.lateAfter;
    }
    if (b.checkOutTime !== undefined) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.checkOutTime)) return res.status(400).json({ message: 'Check-out time must look like 17:00' });
      s.checkOutTime = b.checkOutTime;
    }
    if (s.checkOutTime <= s.lateAfter) return res.status(400).json({ message: 'Check-out time must be later than the check-in time' });
    if (typeof b.allowEarlyCheckout === 'boolean') s.allowEarlyCheckout = b.allowEarlyCheckout;
    if (b.halfDayBelowHours !== undefined) {
      const n = Number(b.halfDayBelowHours);
      if (!(n >= 0 && n <= 24)) return res.status(400).json({ message: 'Half-day hours must be between 0 and 24' });
      s.halfDayBelowHours = n;
    }
    if (b.minCheckoutGapMinutes !== undefined) {
      const n = Number(b.minCheckoutGapMinutes);
      if (!(n >= 0 && n <= 600)) return res.status(400).json({ message: 'Minimum gap must be between 0 and 600 minutes' });
      s.minCheckoutGapMinutes = n;
    }
    if (Array.isArray(b.weekOffDays)) s.weekOffDays = b.weekOffDays.map(Number).filter((d) => d >= 0 && d <= 6);
    if (b.timezone !== undefined) {
      if (!validTimezone(b.timezone)) return res.status(400).json({ message: 'Unknown timezone' });
      s.timezone = b.timezone;
    }
    if (b.matchThreshold !== undefined) {
      const n = Number(b.matchThreshold);
      if (!(n >= 0.35 && n <= 0.65)) return res.status(400).json({ message: 'Match threshold must be between 0.35 and 0.65' });
      s.matchThreshold = n;
    }
    if (typeof b.selfMarking === 'boolean') s.selfMarking = b.selfMarking;
    await s.save();

    const changed = Object.fromEntries([...RULE_KEYS, ...BIO_KEYS].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(s[k])).map((k) => [k, { from: before[k], to: s[k] }]));
    audit(req, touchesBio ? 'settings.biometric' : 'settings.update', { meta: changed });
    res.json({ settings: s });
  } catch (err) { next(err); }
});

module.exports = router;
