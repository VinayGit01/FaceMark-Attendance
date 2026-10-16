const router = require('express').Router();
const AuditLog = require('../models/AuditLog');
const { protect, allow } = require('../middleware/auth');
const { escapeRx } = require('../config/permissions');

router.use(protect, allow('audit.view'));

router.get('/', async (req, res, next) => {
  try {
    const { action, q, from, to } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const filter = {};
    if (action) filter.action = action;
    if (q) { const rx = new RegExp(escapeRx(q), 'i'); filter.$or = [{ actorName: rx }, { targetName: rx }]; }
    if (from || to) {
      filter.at = {};
      if (from) filter.at.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) filter.at.$lte = new Date(`${to}T23:59:59.999Z`);
    }
    const [items, total, actions] = await Promise.all([
      AuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * 50).limit(50),
      AuditLog.countDocuments(filter),
      AuditLog.distinct('action'),
    ]);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / 50)), actions: actions.sort() });
  } catch (err) { next(err); }
});

module.exports = router;
