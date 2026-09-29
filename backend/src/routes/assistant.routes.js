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
router.get('/chats/contacts', requireScope('support_chat'), assistantController.chatContacts);
router.get('/chats/:userId', requireScope('support_chat'), assistantController.getMessages);
router.post('/chats/:userId/send', requireScope('support_chat'), assistantController.sendMessage);

module.exports = router;
