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
    enum: ['patient', 'nurse', 'admin'],
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
  }

}, {
  timestamps: true
});

// Only compound index - unique fields already have indexes
userSchema.index({ role: 1, status: 1 });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
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
