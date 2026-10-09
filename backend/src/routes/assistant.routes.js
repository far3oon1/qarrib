const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/assistant.controller');
const { protect, requireScope } = require('../middleware/auth');

// All assistant routes are online + masked. Admins may also use them.
router.use(protect);

router.get('/me', assistantController.getMe);
router.get('/users', requireScope('manage_users_basic'), assistantController.listUsers);
router.patch('/users/:id/status', requireScope('manage_users_basic'), assistantController.toggleStatus);
router.get('/orders', requireScope('manage_orders'), assistantController.listOrders);
// Price review queue (masked) — assistants pass/reject nurse prices when no admin is around
router.get('/offers', requireScope('manage_orders'), assistantController.listOffers);
router.post('/offers/:orderId/pass', requireScope('manage_orders'), assistantController.passOffer);
router.post('/offers/:orderId/reject', requireScope('manage_orders'), assistantController.rejectOffer);
// Manual transfer queue (masked) — approve upfront payments when no admin is around
router.get('/order-payments', requireScope('manage_payments_help'), assistantController.listOrderPayments);
router.post('/order-payments/:paymentId', requireScope('manage_payments_help'), assistantController.reviewOrderPayment);
router.get('/chats/contacts', requireScope('support_chat'), assistantController.chatContacts);
router.get('/chats/:userId', requireScope('support_chat'), assistantController.getMessages);
router.post('/chats/:userId/send', requireScope('support_chat'), assistantController.sendMessage);

module.exports = router;
