const mongoose = require('mongoose');
const CallSignal = require('../models/CallSignal');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const allowedRoles = ['admin', 'nurse', 'patient'];
const allowedEvents = ['call_offer', 'call_answer', 'call_ice', 'call_end', 'call_reject', 'call_busy'];

const sendSignal = asyncHandler(async (req, res) => {
  const { to, event, payload } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(to) || String(to) === String(req.user._id)) {
    throw new ApiError(400, 'Invalid call recipient');
  }
  if (!allowedRoles.includes(req.user.role) || !allowedEvents.includes(event)) {
    throw new ApiError(403, 'Call signaling is not available for this account');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || JSON.stringify(payload).length > 100000) {
    throw new ApiError(400, 'Invalid call signal payload');
  }

  const recipient = await User.findById(to).select('_id role isActive');
  if (!recipient || recipient.isActive === false || !allowedRoles.includes(recipient.role)) {
    throw new ApiError(404, 'Call recipient not found');
  }

  await CallSignal.create({
    from: req.user._id,
    to: recipient._id,
    event,
    payload,
    expiresAt: new Date(Date.now() + 3 * 60 * 1000)
  });
  res.status(201).json({ success: true });
});

const receiveSignals = asyncHandler(async (req, res) => {
  const now = new Date();
  const signals = await CallSignal.find({ to: req.user._id, expiresAt: { $gt: now } })
    .sort({ createdAt: 1 })
    .limit(50)
    .lean();

  if (signals.length) {
    await CallSignal.deleteMany({
      _id: { $in: signals.map((signal) => signal._id) },
      to: req.user._id
    });
  }

  res.json({
    success: true,
    data: signals.map((signal) => ({
      event: signal.event,
      from: String(signal.from),
      payload: signal.payload
    }))
  });
});

module.exports = { sendSignal, receiveSignals };