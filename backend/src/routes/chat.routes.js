const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/my-chats', chatController.getMyChats);
router.get('/:orderId', chatController.getMessages);
router.post('/:orderId/send', chatController.sendMessage);
router.post('/:orderId/location', chatController.sendLocation);
router.get('/:orderId/unread', chatController.getUnreadCount);

module.exports = router;
