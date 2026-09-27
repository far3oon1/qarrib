const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  title: {
    type: String,
    required: true
  },

  message: {
    type: String,
    required: true
  },

  type: {
    type: String,
    enum: ['order', 'verification', 'payment', 'system', 'general'],
    default: 'general'
  },

  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  isRead: {
    type: Boolean,
    default: false
  },

  readAt: {
    type: Date,
    default: null
  }

}, { timestamps: true });

notificationSchema.index({ recipient: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
