// Public service catalog (prices patients see when requesting).
// No auth needed — only active services with public fields.
const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(async (req, res) => {
  const services = await Service.find({ isActive: true })
    .select('name nameAr basePrice category')
    .sort({ createdAt: 1 });
  ResponseHelper.success(res, { services }, 'Service prices');
}));

module.exports = router;
