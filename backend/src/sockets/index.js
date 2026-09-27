const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Order = require('../models/Order');
const Chat = require('../models/Chat');

let io = null;

function initializeSocket(server) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL || '*', methods: ['GET', 'POST'] }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id role');
      if (!user) return next(new Error('Invalid token'));
      socket.userId = String(user._id);
      socket.userRole = user.role;
      return next();
    } catch (e) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user_${socket.userId}`);
    User.findByIdAndUpdate(socket.userId, { isOnline: true }).catch(() => {});

    socket.on('subscribe_order', async ({ orderId }) => {
      try {
        const order = await Order.findById(orderId).select('patient assignedNurse');
        if (!order) return;
        const uid = socket.userId;
        if (socket.userRole === 'admin' || String(order.patient) === uid || (order.assignedNurse && String(order.assignedNurse) === uid)) {
          socket.join(`order_${orderId}`);
          socket.emit('subscribed_location', { orderId });
        }
      } catch (_) { /* ignore */ }
    });

    socket.on('subscribe_location', async ({ orderId }) => {
      try {
        const order = await Order.findById(orderId).select('patient assignedNurse');
        if (!order) return;
        const uid = socket.userId;
        if (socket.userRole === 'admin' || String(order.patient) === uid || (order.assignedNurse && String(order.assignedNurse) === uid)) {
          socket.join(`order_${orderId}`);
          socket.emit('subscribed_location', { orderId });
        }
      } catch (_) { /* ignore */ }
    });

    // Live GPS: {lat, lng, orderId}
    socket.on('update_location', async ({ lat, lng, orderId }) => {
      try {
        if (lat == null || lng == null) return;
        await User.findByIdAndUpdate(socket.userId, { 'location.coordinates': { lat: Number(lat), lng: Number(lng) } });
        if (orderId) {
          const patch = socket.userRole === 'nurse'
            ? { nurseLiveLocation: { lat: Number(lat), lng: Number(lng), updatedAt: new Date() } }
            : { patientLiveLocation: { lat: Number(lat), lng: Number(lng), updatedAt: new Date() } };
          await Order.findByIdAndUpdate(orderId, patch);
          socket.to(`order_${orderId}`).emit('location_update', {
            userId: socket.userId, role: socket.userRole,
            lat: Number(lat), lng: Number(lng), timestamp: new Date().toISOString()
          });
        }
      } catch (_) { /* ignore */ }
    });

    socket.on('join_chat', async ({ orderId }) => {
      try {
        const order = await Order.findById(orderId).select('patient assignedNurse');
        if (!order) return;
        const uid = socket.userId;
        if (socket.userRole === 'admin' || String(order.patient) === uid || (order.assignedNurse && String(order.assignedNurse) === uid)) {
          socket.join(`order_${orderId}`);
          socket.emit('joined_chat', { orderId });
        }
      } catch (_) { /* ignore */ }
    });

    socket.on('send_message', async ({ orderId, content, type, location }) => {
      try {
        const order = await Order.findById(orderId).select('patient assignedNurse');
        if (!order) return;
        const uid = socket.userId;
        if (socket.userRole !== 'admin' && String(order.patient) !== uid && (!order.assignedNurse || String(order.assignedNurse) !== uid)) return;
        const message = await Chat.create({
          order: order._id, sender: uid, senderRole: socket.userRole,
          content: content || '', type: type || 'text', location: location || null
        });
        io.to(`order_${orderId}`).emit('new_message', message);
      } catch (_) { /* ignore */ }
    });

    socket.on('typing', ({ orderId, isTyping }) => {
      socket.to(`order_${orderId}`).emit('typing', { userId: socket.userId, isTyping: !!isTyping });
    });

    socket.on('disconnect', () => {
      User.findByIdAndUpdate(socket.userId, { isOnline: false }).catch(() => {});
    });
  });

  return io;
}

function emitToUser(userId, event, data) {
  if (io) io.to(`user_${userId}`).emit(event, data);
}

function emitToOrder(orderId, event, data) {
  if (io) io.to(`order_${orderId}`).emit(event, data);
}

async function emitToNurses(event, data) {
  if (!io) return;
  try {
    const nurses = await User.find({ role: 'nurse', status: 'approved', isActive: true }).select('_id');
    nurses.forEach((n) => io.to(`user_${String(n._id)}`).emit(event, data));
  } catch (_) { /* ignore */ }
}

module.exports = { initializeSocket, emitToUser, emitToOrder, emitToNurses, getIO: () => io };
