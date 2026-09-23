const Database = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Order {
    constructor() {
        this.db = new Database('orders');
    }

    create(orderData) {
        const order = {
            id: uuidv4(),
            patientId: orderData.patientId,
            nurseId: null, // Will be set when nurse accepts

            // Service details
            serviceType: orderData.serviceType,
            description: orderData.description,
            address: orderData.address,
            location: orderData.location, // { lat, lng }

            // Financial
            amount: orderData.amount, // in EGP
            amountCents: orderData.amount * 100,
            requestedPrice: orderData.requestedPrice || orderData.amount || 0,
            nursePrice: orderData.nursePrice || orderData.amount || 0,
            platformFee: Math.round((orderData.amount || 0) * 0.1 * 100) / 100, // 10% platform fee
            nurseEarnings: Math.round((orderData.amount || 0) * 0.9 * 100) / 100, // 90% to nurse

            // Payment
            paymentStatus: 'pending', // pending, held, released, refunded
            paymentMethod: orderData.paymentMethod || 'card',
            paymobOrderId: null,
            paymobTransactionId: null,

            // Status flow
            status: 'pending', // pending -> accepted -> in_progress -> completed -> cancelled
            // pending: Request created, waiting for nurse
            // accepted: Nurse accepted the request
            // in_progress: Nurse arrived/started service
            // completed: Service done, both confirmed
            // cancelled: Cancelled by either party

            // Timestamps
            acceptedAt: null,
            startedAt: null,
            completedAt: null,
            cancelledAt: null,

            // Confirmation
            patientConfirmed: false,
            nurseConfirmed: false,

            // Ratings
            patientRating: null,
            nurseRating: null,
            patientReview: null,
            nurseReview: null,

            createdAt: new Date().toISOString()
        };

        return this.db.insert(order);
    }

    findAll(query = {}) {
        return this.db.find(query);
    }

    findById(id) {
        return this.db.findById(id);
    }

    findByPatient(patientId) {
        return this.db.find({ patientId });
    }

    findByNurse(nurseId) {
        return this.db.find({ nurseId });
    }

    findPending() {
        return this.db.find({ status: 'pending' });
    }

    findActiveByNurse(nurseId) {
        return this.db.find({ 
            nurseId, 
            status: { $in: ['accepted', 'in_progress'] } 
        });
    }

    updateStatus(id, status, additionalData = {}) {
        const updates = { status, ...additionalData };

        if (status === 'accepted') updates.acceptedAt = new Date().toISOString();
        if (status === 'in_progress') updates.startedAt = new Date().toISOString();
        if (status === 'completed') updates.completedAt = new Date().toISOString();
        if (status === 'cancelled') updates.cancelledAt = new Date().toISOString();

        return this.db.updateById(id, updates);
    }

    confirmCompletion(id, role) {
        const order = this.findById(id);
        if (!order) return null;

        const updates = {};
        if (role === 'patient') updates.patientConfirmed = true;
        if (role === 'nurse') updates.nurseConfirmed = true;

        // If both confirmed, mark as completed
        const patientConfirmed = role === 'patient' ? true : order.patientConfirmed;
        const nurseConfirmed = role === 'nurse' ? true : order.nurseConfirmed;

        if (patientConfirmed && nurseConfirmed) {
            updates.status = 'completed';
            updates.completedAt = new Date().toISOString();
            updates.paymentStatus = 'released';
        }

        return this.db.updateById(id, updates);
    }

    assignNurse(id, nurseId) {
        return this.db.updateById(id, { 
            nurseId, 
            status: 'accepted',
            acceptedAt: new Date().toISOString()
        });
    }

    updatePayment(id, paymentData) {
        return this.db.updateById(id, {
            paymobOrderId: paymentData.paymobOrderId,
            paymobTransactionId: paymentData.transactionId,
            paymentStatus: paymentData.status
        });
    }

    addRating(id, role, rating, review) {
        const updates = {};
        if (role === 'patient') {
            updates.patientRating = rating;
            updates.patientReview = review;
        } else {
            updates.nurseRating = rating;
            updates.nurseReview = review;
        }
        return this.db.updateById(id, updates);
    }

    delete(id) {
        return this.db.deleteById(id);
    }

    // Statistics for admin
    getStats() {
        const orders = this.db.find();
        return {
            total: orders.length,
            pending: orders.filter(o => o.status === 'pending').length,
            active: orders.filter(o => ['accepted', 'in_progress'].includes(o.status)).length,
            completed: orders.filter(o => o.status === 'completed').length,
            cancelled: orders.filter(o => o.status === 'cancelled').length,
            totalRevenue: orders
                .filter(o => o.paymentStatus === 'released')
                .reduce((sum, o) => sum + o.amount, 0),
            totalPlatformFees: orders
                .filter(o => o.paymentStatus === 'released')
                .reduce((sum, o) => sum + o.platformFee, 0)
        };
    }
}

module.exports = new Order();
