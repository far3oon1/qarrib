const Joi = require('joi');

const createOrder = Joi.object({
  service: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
  description: Joi.string().min(10).max(2000).required(),
  governorate: Joi.string().min(2).max(50).required(),
  city: Joi.string().min(2).max(50).required(),
  address: Joi.string().min(5).max(200).required(),
  preferredDate: Joi.date().greater('now').required(),
  preferredTime: Joi.string().valid('morning', 'afternoon', 'evening', 'anytime').default('anytime')
});

const submitOffer = Joi.object({
  price: Joi.number().min(1).required(),
  notes: Joi.string().max(500).allow('').optional()
});

module.exports = { createOrder, submitOffer };
