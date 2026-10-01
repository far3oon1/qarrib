const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Order = require('../models/Order');
const Chat = require('../models/Chat');

let io = null;

function initializeSocket(server) {
  const { Server } = require('socket.io');
  const clientOrigins = new Set((process.env.CLIENT_URL || '*').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean));
  const isAllowedSocketOrigin = (origin) => {
    if (!origin || clientOrigins.has('*') || clientOrigins.has(origin)) return true;
    var clean = String(origin).replace(/\/$/, '');
    if (/^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(clean)) return true;
    return /^(https?:\/\/)?([\w-]+\.)*(onrender\.com|github\.io|vercel\.app)(:\d+)?$/.test(clean);
  };
  io = new Server(server, {
    cors: { origin: (origin, cb) => (isAllowedSocketOrigin(origin) ? cb(null, true) : cb(null, false)), methods: ['GET', 'POST'] }
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

    // Direct admin <-> nurse thread: {to, content}
    socket.on('join_direct', ({ userId }) => {
      try {
        if (!userId) return;
        if (!['admin', 'nurse'].includes(socket.userRole)) return;
        const a = socket.userId < String(userId) ? socket.userId : String(userId);
        const b = socket.userId < String(userId) ? String(userId) : socket.userId;
        socket.join(`direct_${a}_${b}`);
        socket.emit('joined_direct', { userId: String(userId) });
      } catch (_) { /* ignore */ }
    });

    socket.on('send_direct', async ({ to, content }) => {
      try {
        if (!to || !content || !String(content).trim()) return;
        if (!['admin', 'nurse'].includes(socket.userRole)) return;
        const other = await User.findById(to).select('_id role');
        if (!other) return;
        if (socket.userRole === 'admin' && other.role !== 'nurse') return;
        if (socket.userRole === 'nurse' && other.role !== 'admin') return;
        const message = await Chat.create({
          order: null, directTo: other._id,
          sender: socket.userId, senderRole: socket.userRole,
          content: String(content).trim(), type: 'text'
        });
        const a = socket.userId < String(other._id) ? socket.userId : String(other._id);
        const b = socket.userId < String(other._id) ? String(other._id) : socket.userId;
        io.to(`direct_${a}_${b}`).emit('new_direct_message', message);
        io.to(`user_${String(other._id)}`).emit('notification', { title: 'رسالة جديدة', directFrom: socket.userId });
      } catch (_) { /* ignore */ }
    });

    // WebRTC in-app voice calling signaling
    socket.on('call_offer', ({ to, offer }) => {
      if (!to || !offer) return;
      io.to(`user_${to}`).emit('call_offer', { from: socket.userId, offer });
    });

    socket.on('call_answer', ({ to, answer }) => {
      if (!to || !answer) return;
      io.to(`user_${to}`).emit('call_answer', { from: socket.userId, answer });
    });

    socket.on('call_ice', ({ to, candidate }) => {
      if (!to || !candidate) return;
      io.to(`user_${to}`).emit('call_ice', { from: socket.userId, candidate });
    });

    socket.on('call_end', ({ to }) => {
      if (!to) return;
      io.to(`user_${to}`).emit('call_end', { from: socket.userId });
    });

    socket.on('call_reject', ({ to }) => {
      if (!to) return;
      io.to(`user_${to}`).emit('call_reject', { from: socket.userId });
    });

    socket.on('call_busy', ({ to }) => {
      if (!to) return;
      io.to(`user_${to}`).emit('call_busy', { from: socket.userId });
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
