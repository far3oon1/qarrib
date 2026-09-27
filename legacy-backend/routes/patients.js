const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

// Get Patient Dashboard Data
router.get('/dashboard', authenticate, authorize('patient'), (req, res) => {
    try {
        const patientId = req.user.id;
        const user = User.findById(patientId);

        const orders = Order.findByPatient(patientId);
        const activeOrders = orders.filter(o => ['pending', 'accepted', 'in_progress'].includes(o.status));
        const completedOrders = orders.filter(o => o.status === 'completed');

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    walletBalance: user.walletBalance,
                    currentLocation: user.currentLocation,
                    servicePrice: user.servicePrice || 0,
                    servicePriceText: user.servicePriceText || ''
                },
                stats: {
                    totalOrders: orders.length,
                    activeOrders: activeOrders.length,
                    completedOrders: completedOrders.length
                },
                activeOrders: activeOrders.slice(0, 5),
                recentOrders: orders.slice(-5).reverse()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Patient Profile
router.put('/profile', authenticate, authorize('patient'), (req, res) => {
    try {
        const { name, phone, address, currentLocation } = req.body;
        const updates = {};

        if (name) updates.name = name;
        if (phone) updates.phone = phone;
        if (address) updates.address = address;
        if (currentLocation) updates.currentLocation = currentLocation;

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
router.post('/location', authenticate, authorize('patient'), (req, res) => {
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

// Get Patient Orders
router.get('/orders', authenticate, authorize('patient'), (req, res) => {
    try {
        const orders = Order.findByPatient(req.user.id);
        res.json({
            success: true,
            data: orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Patient Wallet
router.get('/wallet', authenticate, authorize('patient'), (req, res) => {
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

// Get Nearby Nurses
router.get('/nearby-nurses', authenticate, authorize('patient'), (req, res) => {
    try {
        const { lat, lng, distance = 10 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const nurses = User.getNearbyNurses(
            { lat: parseFloat(lat), lng: parseFloat(lng) },
            parseFloat(distance)
        );

        res.json({
            success: true,
            count: nurses.length,
            data: nurses.map(n => ({
                id: n.id,
                name: n.name,
                phone: n.phone,
                specialization: n.specialization,
                yearsOfExperience: n.yearsOfExperience,
                rating: n.rating,
                totalRatings: n.totalRatings,
                currentLocation: n.currentLocation,
                isOnline: n.isOnline,
                servicePrice: n.servicePrice || 0,
                servicePriceText: n.servicePriceText || ''
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
