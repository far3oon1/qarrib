const Order = require('../models/Order');
const Chat = require('../models/Chat');
const ResponseHelper = require('../utils/response');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const Notification = require('../models/Notification');
const User = require('../models/User');

const isParticipant = (order, uid, role) => {
  if (role === 'admin') return true; // admins can join any order chat (nurse<->admin discussion)
  return String(order.patient) === String(uid) ||
    (order.assignedNurse && String(order.assignedNurse) === String(uid));
};

// Legacy alias: pages use msg.senderId / msg.id
const shapeMessage = (m) => {
  const o = typeof m.toObject === 'function' ? m.toObject() : { ...m };
  return {
    ...o,
    id: String(o._id),
    senderId: String(o.sender && (o.sender._id || o.sender))
  };
};

const getMessages = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!isParticipant(order, req.user.id, req.user.role)) throw new ApiError(403, 'Not authorized');
  const messages = await Chat.find({ order: order._id }).sort({ createdAt: 1 });
  await Chat.updateMany({ order: order._id, sender: { $ne: req.user.id }, isRead: false }, { isRead: true, readAt: new Date() });
  ResponseHelper.success(res, messages.map(shapeMessage), 'Chat messages');
});

const getMyChats = asyncHandler(async (req, res) => {
  // Admin: all recent orders. Nurse/patient: own orders. Used by chat list + admin-nurse chat.
  let query = {};
  if (req.user.role === 'patient') query = { patient: req.user.id };
  else if (req.user.role === 'nurse') query = { $or: [{ assignedNurse: req.user.id }, { 'offers.nurse': req.user.id }] };
  const orders = await Order.find(query)
    .populate('patient', 'fullName phone')
    .populate('assignedNurse', 'fullName phone')
    .populate('service', 'nameAr')
    .sort({ updatedAt: -1 })
    .limit(50);
  const out = await Promise.all(orders.map(async (o) => {
    const last = await Chat.findOne({ order: o._id }).sort({ createdAt: -1 });
    const unread = await Chat.countDocuments({ order: o._id, sender: { $ne: req.user.id }, isRead: false });
    return {
      orderId: String(o._id), orderNumber: o.orderNumber, status: o.status,
      service: o.service?.nameAr, patient: o.patient, nurse: o.assignedNurse,
      lastMessage: last ? { content: last.content, senderRole: last.senderRole, createdAt: last.createdAt } : null,
      unreadCount: unread, updatedAt: o.updatedAt
    };
  }));
  ResponseHelper.success(res, out, 'My chats');
});

const sendMessage = asyncHandler(async (req, res) => {
  const { content, type, location } = req.body;
  const order = await Order.findById(req.params.orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!isParticipant(order, req.user.id, req.user.role)) throw new ApiError(403, 'Not authorized');
  if (!content && type !== 'location') throw new ApiError(400, 'Message content is required');
  const message = await Chat.create({
    order: order._id,
    sender: req.user.id,
    senderRole: req.user.role,
    content: content || '',
    type: type || 'text',
    location: location || null
  });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    const targets = [];
    if (String(order.patient) !== String(req.user.id)) targets.push(String(order.patient));
    if (order.assignedNurse && String(order.assignedNurse) !== String(req.user.id)) targets.push(String(order.assignedNurse));
    if (req.user.role !== 'admin') {
      const admins = await User.find({ role: 'admin' }).select('_id');
      admins.forEach((a) => { if (String(a._id) !== String(req.user.id)) targets.push(String(a._id)); });
    }
    for (const t of [...new Set(targets)]) {
      await Notification.create({
        recipient: t, title: 'رسالة جديدة',
        message: `رسالة جديدة في الطلب #${order.orderNumber} من ${req.user.role === 'admin' ? 'الإدارة' : req.user.role === 'nurse' ? 'الممرض' : 'المريض'}`,
        type: 'general', data: { orderId: order._id }
      });
      emitToUser(t, 'notification', { title: 'رسالة جديدة', orderId: order._id });
    }
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, shapeMessage(message), 'Message sent', 201);
});

const sendLocation = asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) throw new ApiError(400, 'lat and lng are required');
  const order = await Order.findById(req.params.orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!isParticipant(order, req.user.id, req.user.role)) throw new ApiError(403, 'Not authorized');
  const message = await Chat.create({
    order: order._id,
    sender: req.user.id,
    senderRole: req.user.role,
    content: 'Shared location',
    type: 'location',
    location: { lat: Number(lat), lng: Number(lng) }
  });
  try {
    const { emitToOrder } = require('../sockets');
    emitToOrder(String(order._id), 'new_message', shapeMessage(message));
    emitToOrder(String(order._id), 'location_update', { userId: String(req.user.id), role: req.user.role, lat: Number(lat), lng: Number(lng), timestamp: new Date().toISOString() });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, shapeMessage(message), 'Location shared', 201);
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Chat.countDocuments({ order: req.params.orderId, sender: { $ne: req.user.id }, isRead: false });
  ResponseHelper.success(res, { unreadCount: count }, 'Unread count');
});

module.exports = { getMessages, getMyChats, sendMessage, sendLocation, getUnreadCount };
