const crypto = require('crypto');

// MAC addresses are NOT visible to websites/apps (browser privacy).
// We use this instead — stable per device, visible in the admin panel:
//   deviceId   : UUID generated once in the browser (localStorage `qarrib_device_id`)
//                sent as X-Device-Id header + body.deviceId
//   fingerprint: sha256(userAgent + platform + deviceId) — groups same-browser logins
//   ip         : server-observed client IP (also blockable)

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return (req.ip || req.connection?.remoteAddress || '').toString().replace(/^::ffff:/, '');
}

function getDeviceId(req) {
  const h = req.headers['x-device-id'] || req.headers['x-deviceid'];
  const b = req.body && (req.body.deviceId || req.body.device_id);
  const q = req.query && (req.query.deviceId || req.query.device_id);
  const v = (h || b || q || '').toString().trim().slice(0, 128);
  return v || null;
}

function getDeviceMeta(req) {
  const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 500);
  const platform =
    (req.body && (req.body.devicePlatform || req.body.platform) || req.headers['x-device-platform'] || '').toString().slice(0, 120) || null;
  const deviceId = getDeviceId(req);
  const ip = getClientIp(req);
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${userAgent}||${platform || ''}||${deviceId || ip || 'unknown'}`)
    .digest('hex')
    .slice(0, 32);
  return { deviceId: deviceId || `fp-${fingerprint}`, userAgent: userAgent || null, platform, ip, fingerprint };
}

// Record (or refresh) the device row on every register/login.
// Never throws — tracking must never break auth.
async function touchDevice({ source, user }) {
  try {
    const Device = require('../models/Device');
    const meta = this; // bound via .call(meta, ...)
    const filter = user?._id
      ? { deviceId: meta.deviceId, user: user._id }
      : { deviceId: meta.deviceId, fingerprint: meta.fingerprint };
    const update = {
      $set: {
        user: user?._id || null,
        email: user?.email || null,
        phone: user?.phone || null,
        role: user?.role || null,
        userAgent: meta.userAgent,
        platform: meta.platform,
        fingerprint: meta.fingerprint,
        ip: meta.ip,
        lastSeen: new Date(),
      },
      $inc: { loginCount: 1 },
      $setOnInsert: { firstSeenSource: source || 'auto' },
    };
    await Device.findOneAndUpdate(filter, update, { upsert: true, new: true });
  } catch (_) { /* ignore */ }
}

// The exact sentence a blocked user sees (AR primary, EN via i18n dict).
// Frontend shows message/message_en by active language + a ⛔ banner.
function blockedMessage(reason) {
  const clean = (reason || '').toString().trim().slice(0, 200);
  return clean
    ? `تم حظرك لمخالفة قواعد التطبيق: ${clean}`
    : 'تم حظرك لمخالفة قواعد التطبيق';
}

// Throws 403 when this device/IP is blocked.
async function assertDeviceAllowed(meta) {
  const Device = require('../models/Device');
  const ApiError = require('./ApiError');
  // 1) exact device blocked?
  if (meta.deviceId) {
    const hit = await Device.findOne({ deviceId: meta.deviceId, blocked: true }).lean();
    if (hit) throw new ApiError(403, blockedMessage(hit.blockReason));
  }
  // 2) manual IP block? (admin blocks an IP -> we store a blocked row with deviceId `ip:<addr>`)
  if (meta.ip) {
    const ipHit = await Device.findOne({ deviceId: `ip:${meta.ip}`, blocked: true }).lean();
    if (ipHit) throw new ApiError(403, blockedMessage(ipHit.blockReason));
  }
  // 3) fingerprint-level block (same browser reinstall that lost its UUID)?
  const fpHit = await Device.findOne({ deviceId: `fp:${meta.fingerprint}`, blocked: true }).lean();
  if (fpHit) throw new ApiError(403, blockedMessage(fpHit.blockReason));
}

// Throws 403 when THIS ACCOUNT has any blocked device (e.g. admin chose
// "block all devices + suspend" on the Users page). Call after loading the
// user, before the isActive/status checks, so the user sees the blocked
// sentence instead of a generic "account disabled".
async function assertUserNotBlocked(user) {
  const Device = require('../models/Device');
  const ApiError = require('./ApiError');
  if (!user || !user._id) return;
  const hit = await Device.findOne({ user: user._id, blocked: true }).sort({ blockedAt: -1 }).lean();
  if (hit) throw new ApiError(403, blockedMessage(hit.blockReason));
}

module.exports = { getClientIp, getDeviceId, getDeviceMeta, touchDevice, assertDeviceAllowed, assertUserNotBlocked, blockedMessage };
