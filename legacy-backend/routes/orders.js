const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

// Create New Request (Patient)
router.post('/create', authenticate, authorize('patient'), (req, res) => {
    try {
        const { serviceType, description, address, location, amount, paymentMethod, requestedPrice, nursePrice } = req.body;

        if (!serviceType || !address || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Service type, address, and amount are required'
            });
        }

        const finalAmount = parseFloat(amount || requestedPrice || nursePrice || 0);
        const patient = User.findById(req.user.id);

        // Check if patient has enough balance or will pay via Paymob
        if (paymentMethod === 'wallet' && patient.walletBalance < finalAmount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient wallet balance. Please recharge your wallet.',
                data: { required: finalAmount, available: patient.walletBalance }
            });
        }

        const order = Order.create({
            patientId: req.user.id,
            serviceType,
            description: description || '',
            address,
            location: location || null,
            amount: finalAmount,
            requestedPrice: parseFloat(requestedPrice || finalAmount || 0),
            nursePrice: parseFloat(nursePrice || finalAmount || 0),
            paymentMethod: paymentMethod || 'card'
        });

        // If wallet payment, deduct from patient wallet
        if (paymentMethod === 'wallet') {
            User.updateWallet(req.user.id, -finalAmount);
            Wallet.create({
                userId: req.user.id,
                orderId: order.id,
                type: 'payment',
                amount: finalAmount,
                status: 'completed',
                paymentMethod: 'wallet',
                description: `Payment for order #${order.id.slice(0, 8)}`,
                balanceAfter: patient.walletBalance - finalAmount
            });

            Order.updateStatus(order.id, 'pending', { paymentStatus: 'held' });
        }

        res.status(201).json({
            success: true,
            message: 'Request created successfully',
            data: order
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Accept Request (Nurse)
router.post('/:id/accept', authenticate, authorize('nurse'), (req, res) => {
    try {
        const orderId = req.params.id;
        const nurseId = req.user.id;

        const order = Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        if (order.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'This request has already been accepted or cancelled'
            });
        }

        const nurse = User.findById(nurseId);
        if (!nurse.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'Your account is not verified yet'
            });
        }

        Order.assignNurse(orderId, nurseId);

        res.json({
            success: true,
            message: 'Request accepted successfully',
            data: Order.findById(orderId)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Start Service (Nurse arrived)
router.post('/:id/start', authenticate, authorize('nurse'), (req, res) => {
    try {
        const orderId = req.params.id;
        const order = Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.nurseId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (order.status !== 'accepted') {
            return res.status(400).json({ success: false, message: 'Order must be accepted first' });
        }

        Order.updateStatus(orderId, 'in_progress');

        res.json({
            success: true,
            message: 'Service started',
            data: Order.findById(orderId)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Confirm Service Completion
router.post('/:id/confirm', authenticate, (req, res) => {
    try {
        const orderId = req.params.id;
        const { role } = req.body; // 'patient' or 'nurse'

        const order = Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Verify user is part of this order
        if (req.user.role === 'patient' && order.patientId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        if (req.user.role === 'nurse' && order.nurseId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (order.status !== 'in_progress') {
            return res.status(400).json({ success: false, message: 'Service must be in progress' });
        }

        const updatedOrder = Order.confirmCompletion(orderId, req.user.role);

        // If both confirmed, release payment to nurse
        if (updatedOrder.status === 'completed') {
            const nurse = User.findById(order.nurseId);

            // Add earnings to nurse wallet
            User.updateWallet(order.nurseId, order.nurseEarnings);
            Wallet.create({
                userId: order.nurseId,
                orderId: order.id,
                type: 'earning',
                amount: order.nurseEarnings,
                status: 'completed',
                description: `Earnings for order #${order.id.slice(0, 8)}`,
                balanceAfter: nurse.walletBalance + order.nurseEarnings
            });

            // Platform fee transaction
            Wallet.create({
                userId: 'platform',
                orderId: order.id,
                type: 'fee',
                amount: order.platformFee,
                status: 'completed',
                description: `Platform fee for order #${order.id.slice(0, 8)}`
            });
        }

        res.json({
            success: true,
            message: updatedOrder.status === 'completed' 
                ? 'Service completed! Payment released to nurse.' 
                : 'Confirmation recorded. Waiting for other party.',
            data: updatedOrder
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Cancel Order
router.post('/:id/cancel', authenticate, (req, res) => {
    try {
        const orderId = req.params.id;
        const { reason } = req.body;

        const order = Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Verify user is part of this order
        if (req.user.role === 'patient' && order.patientId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        if (req.user.role === 'nurse' && order.nurseId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (['completed', 'cancelled'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Order cannot be cancelled' });
        }

        Order.updateStatus(orderId, 'cancelled', { cancelReason: reason || 'Cancelled by user' });

        // Refund patient if payment was made
        if (order.paymentStatus === 'held') {
            const patient = User.findById(order.patientId);
            User.updateWallet(order.patientId, order.amount);
            Wallet.create({
                userId: order.patientId,
                orderId: order.id,
                type: 'refund',
                amount: order.amount,
                status: 'completed',
                description: `Refund for cancelled order #${order.id.slice(0, 8)}`,
                balanceAfter: patient.walletBalance + order.amount
            });
        }

        res.json({
            success: true,
            message: 'Order cancelled successfully',
            data: Order.findById(orderId)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Order Details
router.get('/:id', authenticate, (req, res) => {
    try {
        const order = Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Verify user is part of this order or admin
        if (req.user.role !== 'admin') {
            if (order.patientId !== req.user.id && order.nurseId !== req.user.id) {
                return res.status(403).json({ success: false, message: 'Not authorized' });
            }
        }

        // Get patient and nurse details
        const patient = User.findById(order.patientId);
        const nurse = order.nurseId ? User.findById(order.nurseId) : null;

        res.json({
            success: true,
            data: {
                ...order,
                patient: patient ? { id: patient.id, name: patient.name, phone: patient.phone } : null,
                nurse: nurse ? { id: nurse.id, name: nurse.name, phone: nurse.phone, rating: nurse.rating } : null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Rate Order
router.post('/:id/rate', authenticate, (req, res) => {
    try {
        const orderId = req.params.id;
        const { rating, review } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        const order = Order.findById(orderId);
        if (!order || order.status !== 'completed') {
            return res.status(400).json({ success: false, message: 'Order must be completed to rate' });
        }

        const role = req.user.role;
        Order.addRating(orderId, role, rating, review || '');

        // Update nurse rating
        if (role === 'patient' && order.nurseId) {
            const nurse = User.findById(order.nurseId);
            const newTotal = nurse.totalRatings + 1;
            const newRating = ((nurse.rating * nurse.totalRatings) + rating) / newTotal;
            User.update(order.nurseId, { rating: Math.round(newRating * 10) / 10, totalRatings: newTotal });
        }

        res.json({
            success: true,
            message: 'Rating submitted successfully',
            data: Order.findById(orderId)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
