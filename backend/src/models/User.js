const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },

  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },

  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true,
    match: [/^01[0-256][0-9]{8}$/, 'Please enter a valid Egyptian phone number']
  },

  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },

  role: {
    type: String,
    enum: ['patient', 'nurse', 'admin', 'assistant'],
    required: [true, 'Role is required']
  },

  gender: {
    type: String,
    enum: ['male', 'female'],
    default: null
  },

  nationalId: {
    type: String,
    required: [true, 'National ID is required'],
    unique: true,
    trim: true,
    match: [/^\d{14}$/, 'National ID must be 14 digits']
  },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'active', 'suspended'],
    default: function() {
      return this.role === 'nurse' ? 'pending' : 'active';
    }
  },

  idCardImage: {
    url: { type: String, default: null },
    publicId: { type: String, default: null }
  },

  licenseImage: {
    url: { type: String, default: null },
    publicId: { type: String, default: null }
  },

  specialization: {
    type: String,
    trim: true,
    default: null
  },

  yearsOfExperience: {
    type: Number,
    min: 0,
    max: 50,
    default: 0
  },

  bio: {
    type: String,
    maxlength: 500,
    default: null
  },

  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },

  totalReviews: {
    type: Number,
    default: 0
  },

  location: {
    governorate: { type: String, default: null },
    city: { type: String, default: null },
    address: { type: String, default: null },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    }
  },

  isActive: {
    type: Boolean,
    default: true
  },

  walletBalance: {
    type: Number,
    default: 0,
    min: 0
  },

  payoutMethod: {
    type: String,
    enum: ['bank_transfer', 'vodafone_cash', 'instapay', 'vodafone', 'instapay_bank', null],
    default: null
  },

  payoutAccount: {
    type: String,
    trim: true,
    maxlength: 100,
    default: null
  },

  isOnline: {
    type: Boolean,
    default: false
  },

  // --- Subscription plan (free / pro / vip for patients; free / nurse_vip for nurses) ---
  subscription: {
    plan: { type: String, enum: ['free', 'pro', 'vip', 'nurse_vip'], default: 'free' },
    status: { type: String, enum: ['active', 'expired', 'pending', 'cancelled'], default: 'active' },
    expiresAt: { type: Date, default: null },
    startedAt: { type: Date, default: null }
  },

  // --- Granular feature permissions (admin-controlled per user, GUI editable) ---
  // Admin can add/remove any permission from the dashboard. Defaults grant
  // the core flow; sensitive ones (live tracking, calling) require consent.
  permissions: {
    type: Map,
    of: Boolean,
    default: undefined
  },

  // --- Device / legal consents (location, gallery, calling, notifications) ---
  // Required on mobile + iOS for legal compliance before using live tracking,
  // uploads and call buttons. Collected via the in-app permission gate.
  consents: {
    location: { granted: { type: Boolean, default: false }, updatedAt: { type: Date, default: null } },
    gallery: { granted: { type: Boolean, default: false }, updatedAt: { type: Date, default: null } },
    calling: { granted: { type: Boolean, default: false }, updatedAt: { type: Date, default: null } },
    notifications: { granted: { type: Boolean, default: false }, updatedAt: { type: Date, default: null } },
    terms: { granted: { type: Boolean, default: false }, updatedAt: { type: Date, default: null }, version: { type: String, default: null } }
  },

  // --- Live location sharing control (online permission, per-user) ---
  // shareLiveLocation: master switch. approvedByAdmin: admin can force
  // approve/revoke from GUI. shareWithPatient / shareWithNurse decide who
  // sees the live dot on the track pages.
  locationSharing: {
    shareLiveLocation: { type: Boolean, default: true },
    approvedByAdmin: { type: Boolean, default: true },
    shareWithPatient: { type: Boolean, default: true },
    shareWithNurse: { type: Boolean, default: true }
  },

  lastLogin: {
    type: Date,
    default: null
  },

  passwordResetToken: {
    type: String,
    select: false
  },

  passwordResetExpires: {
    type: Date,
    select: false
  },

  // --- Helper / assistant accounts (created by admin with ticked policies) ---
  // Assistants help manage orders / support-chat nurses & patients, but they
  // NEVER receive registration secrets (see utils/accountView.js masking).
  assistantScopes: {
    type: [String],
    default: []
  },

  assistantLabel: {
    type: String,
    trim: true,
    maxlength: 120,
    default: null
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // --- Encrypted snapshot of registration secrets (admin-only decryption) ---
  // Mirrors { email, phone, nationalId, payoutAccount } encrypted with
  // AES-256-GCM (ENCRYPTION_KEY). Refreshed on every save.
  sensitiveEnc: {
    type: String,
    default: null,
    select: false
  }

}, {
  timestamps: true
});

// Only compound indexes - unique fields already have indexes
userSchema.index({ role: 1, status: 1 });

// The nurse-discovery queries all filter role+status+isActive and then split on
// isOnline, so isActive has to be part of the key or it is a residual filter
// evaluated after the index scan:
//   User.find({ role:'nurse', status:'approved', isActive:true })          nurses list
//   User.find({ ...same, isOnline:true })                                  nearest nurses
//   User.find({ role:{ $in:['patient','nurse'] }, isActive:true })        device list
userSchema.index({ role: 1, status: 1, isActive: 1, isOnline: 1 });

// Contact pickers filter on role + isActive and sort by name.
userSchema.index({ role: 1, isActive: 1, fullName: 1 });

// Live location updates (POST /nurses/location) and the shareLiveLocation gate.
userSchema.index({ 'location.coordinates.lat': 1, 'location.coordinates.lng': 1 });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    // Still refresh the encrypted snapshot when secrets change.
    if (this.isModified('email') || this.isModified('phone') || this.isModified('nationalId') || this.isModified('payoutAccount')) {
      try {
        const { encryptObject } = require('../utils/encryption');
        this.sensitiveEnc = encryptObject({
          email: this.email || null,
          phone: this.phone || null,
          nationalId: this.nationalId || null,
          payoutAccount: this.payoutAccount || null,
        });
      } catch (_) { /* encryption optional */ }
    }
    return next();
  }
  this.password = await bcrypt.hash(this.password, 12);
  try {
    const { encryptObject } = require('../utils/encryption');
    this.sensitiveEnc = encryptObject({
      email: this.email || null,
      phone: this.phone || null,
      nationalId: this.nationalId || null,
      payoutAccount: this.payoutAccount || null,
    });
  } catch (_) { /* encryption optional */ }
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateToken = function() {
  return require('jsonwebtoken').sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
};

module.exports = mongoose.model('User', userSchema);
