const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const {
    createCardPayment,
    createWalletPayment,
    createInstapayPayment,
    verifyTransaction
} = require('../config/paymob');

// Initiate Card Payment (for wallet deposit or order payment)
router.post('/card', authenticate, async (req, res) => {
    try {
        const { amount, type, orderId } = req.body; // type: 'deposit' or 'order'
        const user = User.findById(req.user.id);

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }

        const amountCents = Math.round(amount * 100);
        const merchantOrderId = `QRB-${Date.now()}-${req.user.id.slice(0, 6)}`;

        const paymentData = {
            amountCents,
            currency: 'EGP',
            merchantOrderId,
            description: type === 'deposit' ? 'Wallet Deposit' : 'Order Payment',
            billingData: {
                firstName: user.name.split(' ')[0] || user.name,
                lastName: user.name.split(' ').slice(1).join(' ') || 'User',
                email: user.email,
                phone: user.phone,
                street: user.address || 'NA',
                city: 'Cairo',
                country: 'EG'
            }
        };

        const payment = await createCardPayment(paymentData);

        // Create pending transaction record
        Wallet.create({
            userId: req.user.id,
            orderId: orderId || null,
            type: type === 'deposit' ? 'deposit' : 'payment',
            amount: amount,
            status: 'pending',
            paymentMethod: 'card',
            paymobTransactionId: payment.orderId,
            description: type === 'deposit' ? 'Wallet deposit via card' : `Payment for order`,
            balanceAfter: user.walletBalance
        });

        res.json({
            success: true,
            message: 'Payment initiated',
            data: {
                iframeUrl: payment.iframeUrl,
                paymentKey: payment.paymentKey,
                orderId: payment.orderId,
                merchantOrderId
            }
        });
    } catch (error) {
        console.error('Card payment error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Initiate Vodafone Cash Payment
router.post('/wallet', authenticate, async (req, res) => {
    try {
        const { amount, walletPhone, type, orderId } = req.body;
        const user = User.findById(req.user.id);

        if (!amount || amount <= 0 || !walletPhone) {
            return res.status(400).json({
                success: false,
                message: 'Amount and wallet phone number are required'
            });
        }

        // Validate Egyptian phone
        const phoneRegex = /^01[0-2,5]{1}[0-9]{8}$/;
        if (!phoneRegex.test(walletPhone)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Egyptian phone number'
            });
        }

        const amountCents = Math.round(amount * 100);
        const merchantOrderId = `QRB-W-${Date.now()}-${req.user.id.slice(0, 6)}`;

        const paymentData = {
            amountCents,
            currency: 'EGP',
            merchantOrderId,
            description: type === 'deposit' ? 'Wallet Deposit' : 'Order Payment',
            walletPhone,
            billingData: {
                firstName: user.name.split(' ')[0] || user.name,
                lastName: user.name.split(' ').slice(1).join(' ') || 'User',
                email: user.email,
                phone: walletPhone,
                street: user.address || 'NA',
                city: 'Cairo',
                country: 'EG'
            }
        };

        const payment = await createWalletPayment(paymentData);

        Wallet.create({
            userId: req.user.id,
            orderId: orderId || null,
            type: type === 'deposit' ? 'deposit' : 'payment',
            amount: amount,
            status: 'pending',
            paymentMethod: 'wallet',
            paymobTransactionId: payment.paymobOrderId,
            description: `Wallet deposit via Vodafone Cash`,
            balanceAfter: user.walletBalance
        });

        res.json({
            success: true,
            message: 'Vodafone Cash payment initiated. Check your phone for OTP.',
            data: {
                redirectUrl: payment.redirectUrl,
                paymobOrderId: payment.paymobOrderId,
                merchantOrderId
            }
        });
    } catch (error) {
        console.error('Wallet payment error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Initiate InstaPay Payment
router.post('/instapay', authenticate, async (req, res) => {
    try {
        const { amount, type, orderId } = req.body;
        const user = User.findById(req.user.id);

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }

        const amountCents = Math.round(amount * 100);
        const merchantOrderId = `QRB-I-${Date.now()}-${req.user.id.slice(0, 6)}`;

        const paymentData = {
            amountCents,
            currency: 'EGP',
            merchantOrderId,
            description: type === 'deposit' ? 'Wallet Deposit' : 'Order Payment',
            billingData: {
                firstName: user.name.split(' ')[0] || user.name,
                lastName: user.name.split(' ').slice(1).join(' ') || 'User',
                email: user.email,
                phone: user.phone,
                street: user.address || 'NA',
                city: 'Cairo',
                country: 'EG'
            }
        };

        const payment = await createInstapayPayment(paymentData);

        Wallet.create({
            userId: req.user.id,
            orderId: orderId || null,
            type: type === 'deposit' ? 'deposit' : 'payment',
            amount: amount,
            status: 'pending',
            paymentMethod: 'instapay',
            paymobTransactionId: payment.orderId,
            description: `Wallet deposit via InstaPay`,
            balanceAfter: user.walletBalance
        });

        res.json({
            success: true,
            message: 'InstaPay payment initiated',
            data: {
                redirectUrl: payment.redirectUrl,
                paymentKey: payment.paymentKey,
                orderId: payment.orderId,
                merchantOrderId
            }
        });
    } catch (error) {
        console.error('InstaPay error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Paymob Webhook - Payment Callback
router.post('/webhook', async (req, res) => {
    try {
        const { obj: transaction } = req.body;

        if (!transaction) {
            return res.status(400).json({ success: false, message: 'Invalid webhook data' });
        }

        // Find wallet transaction by Paymob order ID
        const transactions = Wallet.findAll({
            paymobTransactionId: transaction.order?.id || transaction.id
        });

        if (transactions.length === 0) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        const walletTx = transactions[0];
        const user = User.findById(walletTx.userId);

        if (transaction.success === true || transaction.success === 'true') {
            // Payment successful
            Wallet.updateStatus(walletTx.id, 'completed', {
                paymobTransactionId: transaction.id
            });

            if (walletTx.type === 'deposit') {
                // Add to wallet balance
                User.updateWallet(user.id, walletTx.amount);
                Wallet.updateById(walletTx.id, {
                    balanceAfter: user.walletBalance + walletTx.amount
                });
            } else if (walletTx.type === 'payment' && walletTx.orderId) {
                // Update order payment status
                Order.updatePayment(walletTx.orderId, {
                    paymobOrderId: transaction.order?.id,
                    transactionId: transaction.id,
                    status: 'held'
                });
                Order.updateStatus(walletTx.orderId, 'pending', { paymentStatus: 'held' });
            }
        } else {
            // Payment failed
            Wallet.updateStatus(walletTx.id, 'failed', {
                paymobTransactionId: transaction.id
            });
        }

        res.json({ success: true, message: 'Webhook processed' });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Payment Success Redirect
router.get('/success', (req, res) => {
    res.json({
        success: true,
        message: 'Payment completed successfully',
        data: req.query
    });
});

// Payment Failure Redirect
router.get('/failure', (req, res) => {
    res.json({
        success: false,
        message: 'Payment failed or cancelled',
        data: req.query
    });
});

// Verify Transaction Status
router.get('/verify/:transactionId', authenticate, async (req, res) => {
    try {
        const { transactionId } = req.params;
        const transaction = await verifyTransaction(transactionId);

        res.json({
            success: true,
            data: transaction
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
