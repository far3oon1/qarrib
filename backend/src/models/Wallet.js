const mongoose = require('mongoose');

// Wallet transaction ledger (escrow-friendly).
// Balance is denormalized on User.walletBalance for fast reads;
// every mutation must also create a Wallet record.
const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
    index: true
  },

  type: {
    type: String,
    enum: ['deposit', 'payment', 'earning', 'withdrawal', 'refund', 'fee', 'transfer'],
    required: true
  },

  amount: {
    type: Number,
    required: true,
    min: 0
  },

  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
    index: true
  },

  paymentMethod: {
    type: String,
    enum: ['card', 'wallet', 'instapay', 'vodafone_cash', 'cash', 'bank_transfer', null],
    default: null
  },

  paymobTransactionId: {
    type: String,
    default: null
  },

  // Manual top-up reference (e.g. InstaPay transaction number typed by the user)
  reference: {
    type: String,
    default: null,
    maxlength: 100
  },

  description: {
    type: String,
    default: '',
    maxlength: 500
  },

  balanceAfter: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

walletSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Wallet', walletSchema);
