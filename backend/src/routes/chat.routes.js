const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

// Direct admin <-> nurse threads (must come before /:orderId routes)
router.get('/direct/contacts', chatController.getDirectContacts);
router.get('/direct/:userId', chatController.getDirectMessages);
router.post('/direct/:userId/send', chatController.sendDirectMessage);

router.get('/my-chats', chatController.getMyChats);
router.get('/:orderId', chatController.getMessages);
router.post('/:orderId/send', chatController.sendMessage);
router.post('/:orderId/location', chatController.sendLocation);
router.get('/:orderId/unread', chatController.getUnreadCount);

module.exports = router;
