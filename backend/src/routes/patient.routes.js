const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patient.controller');
const orderFlow = require('../controllers/orderFlow.controller');
const walletController = require('../controllers/wallet.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('patient'));

router.get('/dashboard', patientController.getDashboard);
router.put('/profile', patientController.updateProfile);
router.post('/location', patientController.updateLocation);
router.get('/orders', patientController.getMyOrders);
router.get('/orders-with-offers', patientController.getOrdersWithOffers);
router.get('/wallet', patientController.getMyWallet);
router.get('/nearby-nurses', patientController.getNearbyNurses);
router.get('/nurses', patientController.getNursesList);
router.post('/nurse-location', patientController.updateLocation);

// Mobile app compat routes
router.post('/request', orderFlow.createSimple);
router.post('/feedback/:orderId', patientController.giveFeedback);
router.post('/add-balance', walletController.topupRequest);
router.post('/cancel/:orderId', orderFlow.cancelOrder);

module.exports = router;
