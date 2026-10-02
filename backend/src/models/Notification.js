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

// The list endpoint is `find({ recipient }).sort({ createdAt: -1 }).skip().limit()`.
// The index above cannot serve that sort, so Mongo buffered and sorted every
// notification for the user. This compound key answers filter + sort together.
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
