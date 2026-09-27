const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

// Get Nurse Dashboard
router.get('/dashboard', authenticate, authorize('nurse'), (req, res) => {
    try {
        const nurseId = req.user.id;
        const user = User.findById(nurseId);

        const orders = Order.findByNurse(nurseId);
        const activeOrders = orders.filter(o => ['accepted', 'in_progress'].includes(o.status));
        const completedOrders = orders.filter(o => o.status === 'completed');
        const earnings = completedOrders.reduce((sum, o) => sum + o.nurseEarnings, 0);

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    walletBalance: user.walletBalance,
                    isVerified: user.isVerified,
                    rating: user.rating,
                    totalRatings: user.totalRatings
                },
                stats: {
                    totalOrders: orders.length,
                    activeOrders: activeOrders.length,
                    completedOrders: completedOrders.length,
                    totalEarnings: earnings
                },
                activeOrders,
                recentOrders: orders.slice(-5).reverse()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Nurse Profile
router.put('/profile', authenticate, authorize('nurse'), (req, res) => {
    try {
        const { name, phone, specialization, yearsOfExperience, currentLocation, servicePrice, servicePriceText } = req.body;
        const updates = {};

        if (name) updates.name = name;
        if (phone) updates.phone = phone;
        if (specialization) updates.specialization = specialization;
        if (yearsOfExperience) updates.yearsOfExperience = parseInt(yearsOfExperience);
        if (currentLocation) updates.currentLocation = currentLocation;
        if (servicePrice !== undefined) updates.servicePrice = parseFloat(servicePrice);
        if (servicePriceText) updates.servicePriceText = servicePriceText;

        const user = User.update(req.user.id, updates);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: user
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Location
router.post('/location', authenticate, authorize('nurse'), (req, res) => {
    try {
        const { lat, lng } = req.body;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const user = User.updateLocation(req.user.id, { lat, lng });

        res.json({
            success: true,
            message: 'Location updated',
            data: user.currentLocation
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Available Requests (Pending orders near nurse)
router.get('/requests', authenticate, authorize('nurse'), (req, res) => {
    try {
        const nurse = User.findById(req.user.id);

        if (!nurse.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'Your account is not verified yet. Please wait for admin approval.'
            });
        }

        const pendingOrders = Order.findPending();

        // If nurse has location, sort by distance
        let orders = pendingOrders;
        if (nurse.currentLocation) {
            orders = pendingOrders.sort((a, b) => {
                if (!a.location || !b.location) return 0;
                const distA = User.calculateDistance(
                    nurse.currentLocation.lat, nurse.currentLocation.lng,
                    a.location.lat, a.location.lng
                );
                const distB = User.calculateDistance(
                    nurse.currentLocation.lat, nurse.currentLocation.lng,
                    b.location.lat, b.location.lng
                );
                return distA - distB;
            });
        }

        res.json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Nurse Orders
router.get('/orders', authenticate, authorize('nurse'), (req, res) => {
    try {
        const orders = Order.findByNurse(req.user.id);
        res.json({
            success: true,
            data: orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Nurse Wallet
router.get('/wallet', authenticate, authorize('nurse'), (req, res) => {
    try {
        const user = User.findById(req.user.id);
        const transactions = Wallet.findByUser(req.user.id);

        res.json({
            success: true,
            data: {
                balance: user.walletBalance,
                transactions: transactions.slice(0, 20)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Toggle Online Status
router.post('/toggle-status', authenticate, authorize('nurse'), (req, res) => {
    try {
        const nurse = User.findById(req.user.id);
        const newStatus = !nurse.isOnline;
        User.setOnlineStatus(req.user.id, newStatus);

        res.json({
            success: true,
            message: `You are now ${newStatus ? 'online' : 'offline'}`,
            data: { isOnline: newStatus }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
