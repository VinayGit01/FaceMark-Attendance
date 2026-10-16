const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: String,
  actorRole: String,
  action: { type: String, index: true },
  targetType: String,
  targetId: String,
  targetName: String,
  meta: mongoose.Schema.Types.Mixed,
  ip: String,
});

module.exports = mongoose.model('AuditLog', auditSchema);
