const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { protect } = require('../middleware/auth');

// Webhook must be reachable without auth (Paymob server-to-server)
router.post('/webhook', paymentController.webhook);
router.get('/success', paymentController.successRedirect);
router.get('/failure', paymentController.failureRedirect);

router.use(protect);
router.get('/owner-account', paymentController.getOwnerAccount);
router.post('/card', paymentController.initiateCard);
router.post('/wallet', paymentController.initiateWallet);
router.post('/instapay', paymentController.initiateInstapay);

module.exports = router;
