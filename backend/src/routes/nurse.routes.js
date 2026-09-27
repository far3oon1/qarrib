const express = require('express');
const router = express.Router();
const nurseController = require('../controllers/nurse.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('nurse'));

router.get('/dashboard', nurseController.getDashboard);
router.put('/profile', nurseController.updateProfile);
router.post('/location', nurseController.updateLocation);
router.get('/requests', nurseController.getRequests);
router.get('/orders', nurseController.getMyOrders);
router.get('/wallet', nurseController.getMyWallet);
router.get('/transfers', nurseController.nurseTransfers);
router.post('/toggle-status', nurseController.toggleOnlineStatus);

module.exports = router;
