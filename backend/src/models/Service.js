const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },

  nameAr: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    required: true,
    maxlength: 1000
  },

  category: {
    type: String,
    enum: ['wound_care', 'injection', 'iv_therapy', 'vital_signs', 'physiotherapy', 'elderly_care', 'other'],
    required: true
  },

  basePrice: {
    type: Number,
    required: true,
    min: 0
  },

  minPrice: {
    type: Number,
    default: 0
  },

  maxPrice: {
    type: Number,
    default: null
  },

  icon: {
    type: String,
    default: null
  },

  isActive: {
    type: Boolean,
    default: true
  },

  estimatedDuration: {
    type: Number,
    default: 30
  }

}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
