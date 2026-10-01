// Fire-and-forget admin audit trail. NEVER throws and NEVER awaits DB
// longer than needed — call it without await from controllers.
const ACTIONS = [
  'device.block', 'device.unblock',
  'admin.create', 'admin.delete', 'admin.toggle',
  'user.delete', 'user.toggle',
  'nurse.verify',
  'order.price', 'order.status', 'order.remove',
];

function logAdmin(req, action, opts) {
  try {
    const AuditLog = require('../models/AuditLog');
    const o = opts || {};
    let ip = '';
    try {
      const fwd = req && req.headers && req.headers['x-forwarded-for'];
      if (typeof fwd === 'string' && fwd.length) ip = fwd.split(',')[0].trim();
      else if (req && req.ip) ip = String(req.ip).replace(/^::ffff:/, '');
    } catch (_) {}
    const doc = {
      actor: (req && req.user && req.user.id) || (req && req.user && req.user._id) || null,
      actorName: (req && req.user && (req.user.fullName || req.user.email)) || null,
      action,
      targetType: o.targetType || null,
      targetId: o.targetId != null ? String(o.targetId) : null,
      details: o.details != null ? String(o.details).slice(0, 500) : null,
      ip: ip || null,
    };
    AuditLog.create(doc).catch(() => {});
  } catch (_) { /* logging must never break the request */ }
}

module.exports = { logAdmin, ACTIONS };
