const { Server } = require('socket.io');
const User = require('../models/User');
const Order = require('../models/Order');
const Chat = require('../models/Chat');
const { verifyToken } = require('../config/auth');

let io;

function initializeSocket(server) {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || '*',
            methods: ['GET', 'POST']
        }
    });

    // Authentication middleware for sockets
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return next(new Error('Invalid token'));
        }

        socket.userId = decoded.id;
        socket.userRole = decoded.role;
        next();
    });

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.userId} (${socket.userRole})`);

        // Join user-specific room
        socket.join(`user_${socket.userId}`);

        // Update online status
        User.setOnlineStatus(socket.userId, true);

        // Join order rooms for active orders
        const userOrders = socket.userRole === 'patient' 
            ? Order.findByPatient(socket.userId)
            : Order.findByNurse(socket.userId);

        userOrders.forEach(order => {
            if (['accepted', 'in_progress'].includes(order.status)) {
                socket.join(`order_${order.id}`);
            }
        });

        // ===== LOCATION TRACKING =====

        // Update location
        socket.on('update_location', (data) => {
            try {
                const { lat, lng, orderId } = data;

                User.updateLocation(socket.userId, { lat, lng });

                // Broadcast to order room if in active order
                if (orderId) {
                    socket.to(`order_${orderId}`).emit('location_update', {
                        userId: socket.userId,
                        role: socket.userRole,
                        lat,
                        lng,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('Location update error:', error);
            }
        });

        // Subscribe to location updates for an order
        socket.on('subscribe_location', (data) => {
            try {
                const { orderId } = data;
                const order = Order.findById(orderId);

                if (!order) return;

                // Verify user is part of this order
                if (order.patientId === socket.userId || order.nurseId === socket.userId) {
                    socket.join(`order_${orderId}`);
                    socket.emit('subscribed_location', { orderId });
                }
            } catch (error) {
                console.error('Subscribe location error:', error);
            }
        });

        // ===== CHAT =====

        // Join chat room
        socket.on('join_chat', (data) => {
            try {
                const { orderId } = data;
                const order = Order.findById(orderId);

                if (!order) return;

                if (order.patientId === socket.userId || order.nurseId === socket.userId) {
                    socket.join(`order_${orderId}`);
                    socket.emit('joined_chat', { orderId });
                }
            } catch (error) {
                console.error('Join chat error:', error);
            }
        });

        // Send message
        socket.on('send_message', (data) => {
            try {
                const { orderId, content, type, location } = data;
                const order = Order.findById(orderId);

                if (!order) return;
                if (order.patientId !== socket.userId && order.nurseId !== socket.userId) return;

                const message = Chat.create({
                    orderId,
                    senderId: socket.userId,
                    senderRole: socket.userRole,
                    content: content || '',
                    type: type || 'text',
                    location: location || null
                });

                // Broadcast to order room
                io.to(`order_${orderId}`).emit('new_message', {
                    ...message,
                    senderName: User.findById(socket.userId)?.name || 'Unknown'
                });

                // Send notification to other party if offline
                const otherPartyId = socket.userRole === 'patient' ? order.nurseId : order.patientId;
                if (otherPartyId) {
                    const otherUser = User.findById(otherPartyId);
                    if (!otherUser?.isOnline) {
                        io.to(`user_${otherPartyId}`).emit('new_notification', {
                            type: 'chat',
                            title: 'New Message',
                            message: `New message from ${User.findById(socket.userId)?.name}`,
                            orderId
                        });
                    }
                }
            } catch (error) {
                console.error('Send message error:', error);
            }
        });

        // Typing indicator
        socket.on('typing', (data) => {
            const { orderId, isTyping } = data;
            socket.to(`order_${orderId}`).emit('typing', {
                userId: socket.userId,
                isTyping
            });
        });

        // ===== ORDER NOTIFICATIONS =====

        // Subscribe to order updates
        socket.on('subscribe_order', (data) => {
            try {
                const { orderId } = data;
                const order = Order.findById(orderId);

                if (!order) return;

                if (order.patientId === socket.userId || order.nurseId === socket.userId) {
                    socket.join(`order_${orderId}`);
                }
            } catch (error) {
                console.error('Subscribe order error:', error);
            }
        });

        // ===== DISCONNECT =====

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.userId}`);
            User.setOnlineStatus(socket.userId, false);
        });
    });

    return io;
}

// Helper functions for emitting events
function emitToUser(userId, event, data) {
    if (io) {
        io.to(`user_${userId}`).emit(event, data);
    }
}

function emitToOrder(orderId, event, data) {
    if (io) {
        io.to(`order_${orderId}`).emit(event, data);
    }
}

function emitToAll(event, data) {
    if (io) {
        io.emit(event, data);
    }
}

function emitToNurses(event, data) {
    if (io) {
        const nurses = User.findAll({ role: 'nurse', isVerified: true });
        nurses.forEach(nurse => {
            io.to(`user_${nurse.id}`).emit(event, data);
        });
    }
}

module.exports = {
    initializeSocket,
    emitToUser,
    emitToOrder,
    emitToAll,
    emitToNurses,
    getIO: () => io
};
