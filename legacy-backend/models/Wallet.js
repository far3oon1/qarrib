const Database = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Wallet {
    constructor() {
        this.db = new Database('wallets');
    }

    create(transactionData) {
        const transaction = {
            id: uuidv4(),
            userId: transactionData.userId,
            orderId: transactionData.orderId || null,

            // Transaction type
            type: transactionData.type, 
            // 'deposit' - Patient adding money to wallet
            // 'payment' - Patient paying for service
            // 'earning' - Nurse receiving payment
            // 'withdrawal' - Nurse withdrawing money
            // 'refund' - Refund to patient
            // 'fee' - Platform fee

            amount: transactionData.amount, // in EGP
            amountCents: transactionData.amount * 100,

            // Status
            status: transactionData.status || 'pending',
            // pending -> completed / failed

            // Payment method info
            paymentMethod: transactionData.paymentMethod || null, // card, wallet, instapay
            paymobTransactionId: transactionData.paymobTransactionId || null,

            // Description
            description: transactionData.description || '',

            // Balance after transaction
            balanceAfter: transactionData.balanceAfter || 0,

            createdAt: new Date().toISOString()
        };

        return this.db.insert(transaction);
    }

    findAll(query = {}) {
        return this.db.find(query);
    }

    findByUser(userId) {
        return this.db.find({ userId }).sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    }

    findByOrder(orderId) {
        return this.db.find({ orderId });
    }

    findById(id) {
        return this.db.findById(id);
    }

    updateStatus(id, status, additionalData = {}) {
        return this.db.updateById(id, { status, ...additionalData });
    }

    getBalance(userId) {
        const transactions = this.db.find({ userId, status: 'completed' });
        return transactions.reduce((balance, t) => {
            if (['deposit', 'earning', 'refund'].includes(t.type)) {
                return balance + t.amount;
            } else if (['payment', 'withdrawal', 'fee'].includes(t.type)) {
                return balance - t.amount;
            }
            return balance;
        }, 0);
    }

    getStats() {
        const transactions = this.db.find({ status: 'completed' });
        return {
            totalDeposits: transactions
                .filter(t => t.type === 'deposit')
                .reduce((sum, t) => sum + t.amount, 0),
            totalPayments: transactions
                .filter(t => t.type === 'payment')
                .reduce((sum, t) => sum + t.amount, 0),
            totalEarnings: transactions
                .filter(t => t.type === 'earning')
                .reduce((sum, t) => sum + t.amount, 0),
            totalFees: transactions
                .filter(t => t.type === 'fee')
                .reduce((sum, t) => sum + t.amount, 0),
            totalRefunds: transactions
                .filter(t => t.type === 'refund')
                .reduce((sum, t) => sum + t.amount, 0)
        };
    }
}

module.exports = new Wallet();
