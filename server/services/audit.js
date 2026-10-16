const AuditLog = require('../models/AuditLog');

// Fire-and-forget: a logging failure must never break the request.
module.exports = function audit(req, action, d = {}) {
  return AuditLog.create({
    actor: d.actor ?? req.user?._id,
    actorName: d.actorName ?? req.user?.name,
    actorRole: d.actorRole ?? req.user?.role,
    action,
    targetType: d.targetType,
    targetId: d.targetId ? String(d.targetId) : undefined,
    targetName: d.targetName,
    meta: d.meta,
    ip: req.ip,
  }).catch((e) => console.error('audit failed:', e.message));
};
