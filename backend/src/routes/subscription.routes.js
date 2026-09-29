const express = require('express');
const router = express.Router();
const sub = require('../controllers/subscription.controller');
const { protect, authorize } = require('../middleware/auth');

router.get('/plans', protect, sub.listPlans);
router.get('/me', protect, sub.mySubscription);
router.post('/subscribe', protect, authorize('patient', 'nurse'), sub.subscribe);
router.post('/cancel', protect, authorize('patient', 'nurse'), sub.cancel);

router.get('/admin/all', protect, authorize('admin'), sub.adminList);
router.post('/admin/:id', protect, authorize('admin'), sub.adminReview);
router.put('/admin/prices', protect, authorize('admin'), sub.adminPrices);

module.exports = router;
