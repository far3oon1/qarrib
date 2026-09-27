const Joi = require('joi');

const phoneRegex = /^01[0-25][0-9]{8}$/;
const nationalIdRegex = /^\d{14}$/;

const registerPatient = Joi.object({
  fullName: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(phoneRegex).required(),
  password: Joi.string().min(6).max(50).required(),
  nationalId: Joi.string().pattern(nationalIdRegex).required(),
  governorate: Joi.string().min(2).max(50).default('Cairo'),
  city: Joi.string().min(2).max(50).default('Cairo'),
  address: Joi.string().min(5).max(200).required()
});

const registerNurse = Joi.object({
  fullName: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(phoneRegex).required(),
  password: Joi.string().min(6).max(50).required(),
  nationalId: Joi.string().pattern(nationalIdRegex).required(),
  specialization: Joi.string().min(2).max(100).default('general'),
  yearsOfExperience: Joi.number().min(0).max(50).default(0),
  bio: Joi.string().max(500).allow('').optional(),
  governorate: Joi.string().min(2).max(50).default('Cairo'),
  city: Joi.string().min(2).max(50).default('Cairo'),
  address: Joi.string().min(5).max(200).required()
});

const login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const loginPhone = Joi.object({
  phone: Joi.string().pattern(phoneRegex).required(),
  password: Joi.string().required()
});

const adminLogin = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  secretKey: Joi.string().required()
});

const adminRegister = Joi.object({
  fullName: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(50).required(),
  secretKey: Joi.string().required()
});

const adminResetPassword = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).max(50).required()
});

module.exports = { registerPatient, registerNurse, login, loginPhone, adminLogin, adminRegister, adminResetPassword };
