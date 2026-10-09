const mongoose = require('mongoose');

// Complaints: patient <-> nurse reports (impolite, late, no-show, price
// manipulation, misconduct...). Admin reviews and acts as seen fit:
// warn, deduct money, or block — both sides get notified of the decision.
const complaintSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reporterRole: {
    type: String,
    enum: ['patient', 'nurse'],
    required: true
  },
  against: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  againstRole: {
    type: String,
    enum: ['patient', 'nurse'],
    required: true
  },
  category: {
    type: String,
    enum: ['impolite', 'late', 'no_show', 'price_issue', 'misconduct', 'other'],
    default: 'other'
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  status: {
    type: String,
    enum: ['open', 'reviewing', 'resolved', 'dismissed'],
    default: 'open',
    index: true
  },
  resolution: {
    action: { type: String, enum: ['warn', 'deduct', 'block', 'dismiss', null], default: null },
    amount: { type: Number, default: 0 },
    notes: { type: String, default: null, maxlength: 1000 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: null }
  },
}, { timestamps: true });

complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ order: 1, reporter: 1 });

module.exports = mongoose.model('Complaint', complaintSchema);
