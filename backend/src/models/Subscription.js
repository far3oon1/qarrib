const mongoose = require('mongoose');

// One row per subscription purchase (history). Current plan lives on User.subscription.
const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: String, enum: ['free', 'pro', 'vip', 'nurse_vip'], required: true },
  price: { type: Number, required: true, min: 0 },
  durationDays: { type: Number, default: 30 },
  status: { type: String, enum: ['pending', 'active', 'expired', 'cancelled', 'rejected'], default: 'pending', index: true },
  paymentMethod: { type: String, enum: ['wallet', 'instapay', 'cash', 'free'], default: 'wallet' },
  reference: { type: String, default: null, maxlength: 100 },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

subscriptionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
