const Joi = require('joi');

const verifyNurse = Joi.object({
  action: Joi.string().valid('approve', 'approved', 'reject', 'rejected').optional(),
  status: Joi.string().valid('approve', 'approved', 'reject', 'rejected').optional(),
  notes: Joi.string().max(500).allow('').optional()
}).or('action', 'status');

const resetPassword = Joi.object({
  newPassword: Joi.string().min(6).max(50).optional()
});

const updateOrderStatus = Joi.object({
  status: Joi.string().valid(
    'open', 'offers_received', 'under_review', 'price_approved',
    'paid', 'assigned', 'in_progress', 'completed', 'cancelled', 'refunded'
  ).required(),
  notes: Joi.string().max(500).allow('').optional()
});

module.exports = { verifyNurse, resetPassword, updateOrderStatus };
