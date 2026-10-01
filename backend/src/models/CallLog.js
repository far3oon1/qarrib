const mongoose = require('mongoose');

// counts in-app call attempts so Free plan stays at 3 calls per order
// while Pro / VIP / VIP-Nurse get unlimited priority calling.
const callLogSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  callerRole: { type: String, enum: ['patient', 'nurse'], required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

callLogSchema.index({ order: 1, caller: 1, createdAt: -1 });

module.exports = mongoose.model('CallLog', callLogSchema);
