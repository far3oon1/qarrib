const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Order = require('../models/Order');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

// Get Chat Messages for an Order
router.get('/:orderId', authenticate, (req, res) => {
    try {
        const { orderId } = req.params;
        const order = Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Verify user is part of this order
        if (order.patientId !== req.user.id && order.nurseId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const messages = Chat.findByOrder(orderId);

        // Mark messages as read for current user
        Chat.markAllAsRead(orderId, req.user.id);

        res.json({
            success: true,
            data: messages.map(m => ({
                id: m.id,
                senderId: m.senderId,
                senderRole: m.senderRole,
                content: m.content,
                type: m.type,
                location: m.location,
                imageUrl: m.imageUrl,
                isRead: m.isRead,
                createdAt: m.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Send Message
router.post('/:orderId/send', authenticate, (req, res) => {
    try {
        const { orderId } = req.params;
        const { content, type, location } = req.body;

        const order = Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.patientId !== req.user.id && order.nurseId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (!content && type !== 'location') {
            return res.status(400).json({ success: false, message: 'Message content is required' });
        }

        const message = Chat.create({
            orderId,
            senderId: req.user.id,
            senderRole: req.user.role,
            content: content || '',
            type: type || 'text',
            location: location || null
        });

        res.status(201).json({
            success: true,
            message: 'Message sent',
            data: message
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Send Location
router.post('/:orderId/location', authenticate, (req, res) => {
    try {
        const { orderId } = req.params;
        const { lat, lng } = req.body;

        const order = Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.patientId !== req.user.id && order.nurseId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const message = Chat.create({
            orderId,
            senderId: req.user.id,
            senderRole: req.user.role,
            content: 'Shared location',
            type: 'location',
            location: { lat, lng }
        });

        res.status(201).json({
            success: true,
            message: 'Location shared',
            data: message
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Unread Messages Count
router.get('/:orderId/unread', authenticate, (req, res) => {
    try {
        const { orderId } = req.params;
        const count = Chat.getUnreadCount(orderId, req.user.id);

        res.json({
            success: true,
            data: { unreadCount: count }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
