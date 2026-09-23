const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const Document = require('../models/Document');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

// Middleware: Admin only
const adminOnly = authorize('admin');

// Get Admin Dashboard Stats
router.get('/dashboard', authenticate, adminOnly, (req, res) => {
    try {
        const users = User.findAll();
        const orders = Order.findAll();
        const walletStats = Wallet.getStats();
        const pendingDocs = Document.findPending();

        res.json({
            success: true,
            data: {
                stats: {
                    totalUsers: users.length,
                    totalPatients: users.filter(u => u.role === 'patient').length,
                    totalNurses: users.filter(u => u.role === 'nurse').length,
                    verifiedNurses: users.filter(u => u.role === 'nurse' && u.isVerified).length,
                    pendingVerifications: users.filter(u => u.role === 'nurse' && u.verificationStatus === 'pending').length,
                    totalOrders: orders.length,
                    pendingOrders: orders.filter(o => o.status === 'pending').length,
                    activeOrders: orders.filter(o => ['accepted', 'in_progress'].includes(o.status)).length,
                    completedOrders: orders.filter(o => o.status === 'completed').length,
                    cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
                    totalRevenue: walletStats.totalFees,
                    totalDeposits: walletStats.totalDeposits,
                    totalEarnings: walletStats.totalEarnings,
                    pendingDocuments: pendingDocs.length
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get All Users
router.get('/users', authenticate, adminOnly, (req, res) => {
    try {
        const { role, status, search } = req.query;
        let users = User.findAll();

        if (role) users = users.filter(u => u.role === role);
        if (status === 'active') users = users.filter(u => u.isActive);
        if (status === 'inactive') users = users.filter(u => !u.isActive);
        if (search) {
            const searchLower = search.toLowerCase();
            users = users.filter(u => 
                u.name.toLowerCase().includes(searchLower) ||
                u.email.toLowerCase().includes(searchLower) ||
                u.phone.includes(search)
            );
        }

        res.json({
            success: true,
            count: users.length,
            data: users.map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                phone: u.phone,
                role: u.role,
                isActive: u.isActive,
                isVerified: u.isVerified,
                verificationStatus: u.verificationStatus,
                walletBalance: u.walletBalance,
                rating: u.rating,
                createdAt: u.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get User Details
router.get('/users/:id', authenticate, adminOnly, (req, res) => {
    try {
        const user = User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const documents = Document.findByUser(user.id);
        const orders = user.role === 'patient' 
            ? Order.findByPatient(user.id)
            : Order.findByNurse(user.id);

        res.json({
            success: true,
            data: {
                ...user,
                password: undefined,
                documents,
                orders: orders.slice(-10)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update User
router.put('/users/:id', authenticate, adminOnly, (req, res) => {
    try {
        const { isActive, isVerified, verificationStatus } = req.body;
        const updates = {};

        if (isActive !== undefined) updates.isActive = isActive;
        if (isVerified !== undefined) updates.isVerified = isVerified;
        if (verificationStatus) updates.verificationStatus = verificationStatus;

        const user = User.update(req.params.id, updates);

        res.json({
            success: true,
            message: 'User updated successfully',
            data: user
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Pending Verifications
router.get('/verifications', authenticate, adminOnly, (req, res) => {
    try {
        const pendingDocs = Document.findPending();
        const enrichedDocs = pendingDocs.map(doc => {
            const user = User.findById(doc.userId);
            return {
                ...doc,
                user: user ? {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    licenseNumber: user.licenseNumber,
                    specialization: user.specialization
                } : null
            };
        });

        res.json({
            success: true,
            count: enrichedDocs.length,
            data: enrichedDocs
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Approve/Reject Document
router.post('/verifications/:id', authenticate, adminOnly, (req, res) => {
    try {
        const { status, notes } = req.body; // status: 'approved' or 'rejected'

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status must be approved or rejected'
            });
        }

        const doc = Document.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        Document.updateStatus(req.params.id, status, {
            reviewedBy: req.user.id,
            reviewNotes: notes || ''
        });

        // If approving nursing license, verify the nurse
        if (status === 'approved' && doc.type === 'nursing_license') {
            User.update(doc.userId, {
                isVerified: true,
                verificationStatus: 'approved'
            });
        } else if (status === 'rejected' && doc.type === 'nursing_license') {
            User.update(doc.userId, {
                isVerified: false,
                verificationStatus: 'rejected'
            });
        }

        res.json({
            success: true,
            message: `Document ${status} successfully`,
            data: Document.findById(req.params.id)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get All Orders
router.get('/orders', authenticate, adminOnly, (req, res) => {
    try {
        const { status, search } = req.query;
        let orders = Order.findAll();

        if (status) orders = orders.filter(o => o.status === status);

        const enrichedOrders = orders.map(o => {
            const patient = User.findById(o.patientId);
            const nurse = o.nurseId ? User.findById(o.nurseId) : null;
            return {
                ...o,
                patient: patient ? { name: patient.name, phone: patient.phone } : null,
                nurse: nurse ? { name: nurse.name, phone: nurse.phone } : null
            };
        });

        res.json({
            success: true,
            count: enrichedOrders.length,
            data: enrichedOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Payment Reports
router.get('/payments', authenticate, adminOnly, (req, res) => {
    try {
        const transactions = Wallet.findAll({ status: 'completed' });
        const stats = Wallet.getStats();

        res.json({
            success: true,
            data: {
                stats,
                transactions: transactions
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(0, 100)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Process Withdrawal
router.post('/withdrawals/:id/process', authenticate, adminOnly, (req, res) => {
    try {
        const { status } = req.body; // 'completed' or 'rejected'
        const transaction = Wallet.findById(req.params.id);

        if (!transaction || transaction.type !== 'withdrawal') {
            return res.status(404).json({ success: false, message: 'Withdrawal not found' });
        }

        Wallet.updateStatus(req.params.id, status);

        // If rejected, refund the nurse
        if (status === 'rejected') {
            const nurse = User.findById(transaction.userId);
            User.updateWallet(transaction.userId, transaction.amount);
            Wallet.create({
                userId: transaction.userId,
                type: 'deposit',
                amount: transaction.amount,
                status: 'completed',
                description: 'Withdrawal refund',
                balanceAfter: nurse.walletBalance + transaction.amount
            });
        }

        res.json({
            success: true,
            message: `Withdrawal ${status} successfully`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
