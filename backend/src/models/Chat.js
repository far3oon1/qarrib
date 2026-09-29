const mongoose = require('mongoose');

// Chat message scoped to an Order (patient <-> assigned nurse),
// or a direct admin<->nurse thread (order = null, directTo = the other party).
const chatSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
    index: true
  },

  // Direct support thread participant (the person this message is addressed to).
  // For order chats this stays null.
  directTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },

  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  senderRole: {
    type: String,
    enum: ['patient', 'nurse', 'admin'],
    required: true
  },

  content: {
    type: String,
    default: '',
    maxlength: 2000
  },

  type: {
    type: String,
    enum: ['text', 'image', 'location'],
    default: 'text'
  },

  location: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },

  imageUrl: {
    type: String,
    default: null
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

chatSchema.index({ order: 1, createdAt: 1 });
chatSchema.index({ sender: 1, directTo: 1, createdAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);
