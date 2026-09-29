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
