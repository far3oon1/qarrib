const mongoose = require('mongoose');

const callSignalSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event: {
    type: String,
    enum: ['call_offer', 'call_answer', 'call_ice', 'call_end', 'call_reject', 'call_busy'],
    required: true
  },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: { createdAt: true, updatedAt: false } });

callSignalSchema.index({ to: 1, createdAt: 1 });

module.exports = mongoose.model('CallSignal', callSignalSchema);