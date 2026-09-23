const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patient.controller');
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

// Nurse live GPS also needs patient location endpoint used by sockets fallback
router.post('/nurse-location', patientController.updateLocation);

module.exports = router;
