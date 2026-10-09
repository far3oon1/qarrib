const mongoose = require('mongoose');

// Fraud-prevention trail: every sensitive admin action is recorded here
// (device blocks, account add/remove, verifications...) and shown on the
// admin "Audit log" page. Users and helpers can never read this.
const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorName: { type: String, default: null },
  actorRole: { type: String, default: null, index: true },
  action: { type: String, required: true, index: true },
  targetType: { type: String, default: null },
  targetId: { type: String, default: null },
  details: { type: String, default: null },
  ip: { type: String, default: null },
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actorRole: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
