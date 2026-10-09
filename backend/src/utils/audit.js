// App-wide activity trail. NEVER throws and NEVER blocks the request —
// call it without await from controllers (fire-and-forget).
// Two helpers share one writer:
//   logAdmin(req, ...) — sensitive admin actions (fraud-prevention trail)
//   logEvent(req, ...) — ANY actor/role: patient, nurse, assistant, admin.
// The admin "سجل النشاط" panel reads everything with action/role/search.
const ACTIONS = [
  // admin / device (legacy fraud trail)
  'device.block', 'device.unblock',
  'admin.create', 'admin.delete', 'admin.toggle',
  'user.delete', 'user.toggle',
  'nurse.verify',
  'order.price', 'order.status', 'order.remove',
  // auth + waiver
  'auth.register', 'auth.login', 'auth.terms',
  // orders (every move in the app)
  'order.create', 'order.open', 'order.match_refresh',
  'offer.submit', 'offer.pass', 'offer.approve', 'offer.reject', 'offer.assign',
  'order.choose', 'order.pay', 'order.cancel', 'order.confirm', 'order.complete',
  'order.review', 'order.arrive', 'order.report',
  // money
  'payment.transfer_approve', 'payment.transfer_reject',
];

function writeLog({ actor, actorName, actorRole, action, targetType, targetId, details, ip }) {
  try {
    const AuditLog = require('../models/AuditLog');
    AuditLog.create({
      actor: actor || null,
      actorName: actorName || null,
      actorRole: actorRole || null,
      action,
      targetType: targetType || null,
      targetId: targetId != null ? String(targetId) : null,
      details: details != null ? String(details).slice(0, 500) : null,
      ip: ip || null,
    }).catch(() => {});
  } catch (_) { /* logging must never break the request */ }
}

function ipOf(req) {
  try {
    const fwd = req && req.headers && req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
    if (req && req.ip) return String(req.ip).replace(/^::ffff:/, '');
  } catch (_) {}
  return null;
}

function whoOf(req) {
  const u = (req && req.user) || {};
  return {
    actor: u.id || u._id || null,
    actorName: u.fullName || u.email || null,
    actorRole: u.role || null,
  };
}

function logAdmin(req, action, opts) {
  const o = opts || {};
  const w = whoOf(req);
  writeLog({ ...w, action, targetType: o.targetType, targetId: o.targetId, details: o.details, ip: ipOf(req) });
}

// Generic app event for ANY signed-in (or anonymous) actor.
// logEvent(req, 'offer.submit', { targetType:'order', targetId, details })
function logEvent(req, action, opts) {
  const o = opts || {};
  const w = whoOf(req);
  writeLog({ ...w, action, targetType: o.targetType, targetId: o.targetId, details: o.details, ip: ipOf(req) });
}

module.exports = { logAdmin, logEvent, ACTIONS };
