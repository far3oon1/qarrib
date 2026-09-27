const mongoose = require('mongoose');

const verificationLogSchema = new mongoose.Schema({
  nurse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  action: {
    type: String,
    enum: ['submitted', 'approved', 'rejected'],
    required: true
  },

  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  notes: {
    type: String,
    default: null
  },

  idCardImageUrl: {
    type: String,
    default: null
  },

  licenseImageUrl: {
    type: String,
    default: null
  }

}, { timestamps: true });

module.exports = mongoose.model('VerificationLog', verificationLogSchema);
