const mongoose = require('mongoose');

// One row per (deviceId + user). Browsers can't expose a real MAC address,
// so the frontend generates a persistent deviceId (localStorage `qarrib_device_id`)
// + sends userAgent/platform. That triple is the "MAC replacement" the admin
// sees and can block. IPs are also recorded so the admin can block an IP.
const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, trim: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  email: { type: String, default: null },
  phone: { type: String, default: null },
  role: { type: String, default: null },
  userAgent: { type: String, default: null },
  platform: { type: String, default: null },
  fingerprint: { type: String, default: null, index: true },
  ip: { type: String, default: null, index: true },
  firstSeenSource: { type: String, enum: ['register', 'login', 'auto', 'manual-block'], default: 'auto' },
  lastSeen: { type: Date, default: Date.now },
  loginCount: { type: Number, default: 1 },
  blocked: { type: Boolean, default: false, index: true },
  blockReason: { type: String, default: null },
  blockedAt: { type: Date, default: null },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

deviceSchema.index({ deviceId: 1, user: 1 }, { unique: false });
deviceSchema.index({ blocked: 1, updatedAt: -1 });

module.exports = mongoose.model('Device', deviceSchema);
