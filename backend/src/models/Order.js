const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  nurse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  price: {
    type: Number,
    required: true,
    min: 0
  },

  notes: {
    type: String,
    maxlength: 500,
    default: null
  },

  status: {
    type: String,
    enum: ['pending_review', 'approved', 'rejected'],
    default: 'pending_review'
  },

  adminNotes: {
    type: String,
    default: null
  },

  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  reviewedAt: {
    type: Date,
    default: null
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },

  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },

  description: {
    type: String,
    required: true,
    maxlength: 2000
  },

  images: [{
    url: String,
    publicId: String
  }],

  location: {
    governorate: { type: String, required: true },
    city: { type: String, required: true },
    address: { type: String, required: true },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    }
  },

  preferredDate: {
    type: Date,
    required: true
  },

  preferredTime: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'anytime'],
    default: 'anytime'
  },

  offers: [offerSchema],

  selectedOffer: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  finalPrice: {
    type: Number,
    default: null
  },

  commission: {
    type: Number,
    default: 0
  },

  commissionRate: {
    type: Number,
    default: 10
  },

  status: {
    type: String,
    enum: [
      'open', 'offers_received', 'under_review', 'price_approved',
      'paid', 'assigned', 'in_progress', 'completed', 'cancelled', 'refunded'
    ],
    default: 'open'
  },

  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },

  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'wallet', 'fawry', 'vodafone_cash', 'instapay'],
    default: null
  },

  // --- Escrow / double-confirm flow (voice-note requirement) ---
  // Money is HELD on creation, RELEASED only when both sides confirm.
  escrowStatus: {
    type: String,
    enum: ['none', 'held', 'released', 'refunded'],
    default: 'none'
  },

  nurseConfirmed: {
    type: Boolean,
    default: false
  },

  patientConfirmed: {
    type: Boolean,
    default: false
  },

  nurseConfirmedAt: {
    type: Date,
    default: null
  },

  patientConfirmedAt: {
    type: Date,
    default: null
  },

  nurseEarnings: {
    type: Number,
    default: 0,
    min: 0
  },

  platformFee: {
    type: Number,
    default: 0,
    min: 0
  },

  cancelReason: {
    type: String,
    default: null,
    maxlength: 500
  },

  acceptedAt: {
    type: Date,
    default: null
  },

  startedAt: {
    type: Date,
    default: null
  },

  // Last-known live GPS for both parties (updated via REST + sockets)
  nurseLiveLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    updatedAt: { type: Date, default: null }
  },

  patientLiveLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    updatedAt: { type: Date, default: null }
  },

  assignedNurse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  statusHistory: [{
    status: String,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    notes: String
  }],

  completedAt: {
    type: Date,
    default: null
  },

  patientReview: {
    rating: { type: Number, min: 1, max: 5, default: null },
    comment: { type: String, default: null },
    createdAt: { type: Date, default: null }
  },

  nurseReview: {
    rating: { type: Number, min: 1, max: 5, default: null },
    comment: { type: String, default: null },
    createdAt: { type: Date, default: null }
  }

}, { timestamps: true });

// Compound indexes only - orderNumber already has unique index
orderSchema.index({ patient: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'offers.nurse': 1 });
orderSchema.index({ assignedNurse: 1 });
orderSchema.index({ createdAt: -1 });

orderSchema.pre('validate', async function(next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    this.orderNumber = `QRB-${year}${month}${day}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
