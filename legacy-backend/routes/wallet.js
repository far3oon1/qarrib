const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { authenticate } = require('../middleware/auth');

// Get Wallet Balance & Transactions
router.get('/', authenticate, (req, res) => {
    try {
        const user = User.findById(req.user.id);
        const transactions = Wallet.findByUser(req.user.id);

        res.json({
            success: true,
            data: {
                balance: user.walletBalance,
                transactions: transactions.map(t => ({
                    id: t.id,
                    type: t.type,
                    amount: t.amount,
                    status: t.status,
                    paymentMethod: t.paymentMethod,
                    description: t.description,
                    createdAt: t.createdAt,
                    balanceAfter: t.balanceAfter
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Transaction Details
router.get('/transaction/:id', authenticate, (req, res) => {
    try {
        const transaction = Wallet.findById(req.params.id);

        if (!transaction || transaction.userId !== req.user.id) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        res.json({
            success: true,
            data: transaction
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Request Withdrawal (Nurse only)
router.post('/withdraw', authenticate, (req, res) => {
    try {
        const { amount, method, accountDetails } = req.body;
        const user = User.findById(req.user.id);

        if (user.role !== 'nurse') {
            return res.status(403).json({
                success: false,
                message: 'Only nurses can withdraw earnings'
            });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }

        if (user.walletBalance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance',
                data: { requested: amount, available: user.walletBalance }
            });
        }

        // Deduct from wallet
        User.updateWallet(user.id, -amount);

        const transaction = Wallet.create({
            userId: req.user.id,
            type: 'withdrawal',
            amount: amount,
            status: 'pending',
            paymentMethod: method || 'bank_transfer',
            description: `Withdrawal request - ${method || 'bank transfer'}`,
            balanceAfter: user.walletBalance - amount
        });

        res.json({
            success: true,
            message: 'Withdrawal request submitted. It will be processed within 24-48 hours.',
            data: transaction
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
