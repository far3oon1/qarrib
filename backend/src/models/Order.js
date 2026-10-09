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
    // pending_admin = nurse suggested, waiting for ADMIN review (hidden from patient).
    // pending_review = admin passed it to the patient (visible on choose/offers pages).
    enum: ['pending_admin', 'pending_review', 'approved', 'rejected'],
    default: 'pending_admin'
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

  // --- Uber/inDrive shortlist: system picks 3-4 nearest nurses per request ---
  // Patient sees ONLY these candidates on the choose page (with their own
  // price offers + ratings + patient feedback) and picks one.
  matchedNurses: [{
    nurse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    distanceKm: {
      type: Number,
      default: null
    },
    status: {
      type: String,
      enum: ['pending', 'offered', 'chosen', 'declined', 'replaced'],
      default: 'pending'
    },
    invitedAt: {
      type: Date,
      default: Date.now
    },
    respondedAt: {
      type: Date,
      default: null
    }
  }],

  matchRound: {
    type: Number,
    default: 0
  },

  matchExpiresAt: {
    type: Date,
    default: null
  },

  selectedOffer: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  finalPrice: {
    type: Number,
    default: null
  },

  // --- inDrive-style patient bidding ---
  // Patient suggests their own price at request time (never below the admin
  // fixed service price). Nurses see it and counter with their own prices.
  patientOfferedPrice: {
    type: Number,
    default: null,
    min: 0
  },

  // Money actually secured for this order (wallet holds + approved manual
  // transfers). On accept, only the DIFFERENCE vs the accepted price moves.
  amountHeld: {
    type: Number,
    default: 0,
    min: 0
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

  // Nurse response to an admin/patient-approved assignment at a fixed price:
  // null = waiting for the nurse to say OK or decline, true = accepted, false = declined.
  nurseAccepted: {
    type: Boolean,
    default: null
  },

  nurseAcceptedAt: {
    type: Date,
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
  },

  // --- Arrival flag: nurse taps "I arrived" on the track page ---
  // Patient sees it live (banner + step), admin sees it on feedbacks.
  nurseArrived: {
    type: Boolean,
    default: false
  },

  arrivedAt: {
    type: Date,
    default: null
  },

  // --- Per-visit service report written by the nurse after the visit ---
  // Shown to the admin on the Feedbacks page next to the patient rating.
  visitReport: {
    summary: { type: String, maxlength: 2000, default: null },
    createdAt: { type: Date, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  }

}, { timestamps: true });

// Compound indexes only - orderNumber already has unique index
//
// Every read path below is "filter by owner, newest first", so the leading
// field plus a descending createdAt lets Mongo satisfy both the filter and
// the sort from one index instead of an in-memory sort.
//   Order.find({ patient }).sort({ createdAt: -1 })        patient/dashboard
//   Order.find({ assignedNurse }).sort({ createdAt: -1 })  nurse dashboard, my-orders
//   Order.find({ patient, status: { $ne: 'open' } })      patient/orders
orderSchema.index({ patient: 1, createdAt: -1 });
orderSchema.index({ assignedNurse: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'offers.nurse': 1, createdAt: -1 });
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
