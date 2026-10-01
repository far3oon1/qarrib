const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new ApiError(401, 'Not authorized, no token');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = await User.findById(decoded.id).select('-password');

  if (!req.user) {
    throw new ApiError(401, 'User not found');
  }

  // Disabled account -> kick out immediately (admin blocked from panel)
  if (req.user.isActive === false) {
    throw new ApiError(403, 'الحساب معطل، يرجى التواصل مع الدعم');
  }
  if (req.user.status === 'suspended') {
    throw new ApiError(403, 'تم إيقاف الحساب من الإدارة — تواصل مع الدعم');
  }

  // Blocked device -> kick out even with a valid token
  try {
    const { getDeviceMeta, assertDeviceAllowed } = require('../utils/device');
    const meta = getDeviceMeta(req);
    // Only enforce when the client actually sends a device id/fingerprint
    if (req.headers['x-device-id'] || req.body?.deviceId) {
      await assertDeviceAllowed(meta);
    }
    // Per-account device block (same fingerprint blocked for this user)
    const Device = require('../models/Device');
    if (meta.fingerprint) {
      const hit = await Device.findOne({ user: req.user._id, blocked: true, fingerprint: meta.fingerprint }).lean();
      if (hit) throw new ApiError(403, `This device is blocked by the admin${hit.blockReason ? ': ' + hit.blockReason : ''}. Contact support.`);
    }
  } catch (e) {
    if (e.statusCode === 401 || e.statusCode === 403) throw e;
    // tracking failure must never break auth
  }

  next();
});

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, 'Not authorized for this action');
    }
    next();
  };
};

// Assistant scope gate: admins always pass; assistants need the listed scope.
const requireScope = (...scopes) => {
  return (req, res, next) => {
    if (!req.user) throw new ApiError(401, 'Not authorized, no token');
    if (req.user.role === 'admin') return next();
    if (req.user.role !== 'assistant') {
      throw new ApiError(403, 'Not authorized for this action');
    }
    const mine = Array.isArray(req.user.assistantScopes) ? req.user.assistantScopes : [];
    const ok = scopes.length === 0 || scopes.some((s) => mine.includes(s));
    if (!ok) throw new ApiError(403, 'Your helper policies do not allow this action');
    next();
  };
};

module.exports = { protect, authorize, requireScope };
