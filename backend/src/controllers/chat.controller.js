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

// ---------- Direct admin <-> nurse support chat (no order) ----------
// Only admins and nurses may use direct threads.
const assertDirectAllowed = (req) => {
  if (!['admin', 'nurse'].includes(req.user.role)) throw new ApiError(403, 'Direct chat is available between admins and nurses');
};

const directThread = (uidA, uidB) => ({
  $or: [
    { sender: uidA, directTo: uidB },
    { sender: uidB, directTo: uidA }
  ]
});

// GET /api/chat/direct/contacts — admin: all nurses; nurse: all admins.
// Each contact carries the last direct message + unread count.
const getDirectContacts = asyncHandler(async (req, res) => {
  assertDirectAllowed(req);
  const me = String(req.user.id);
  const otherRole = req.user.role === 'admin' ? 'nurse' : 'admin';
  const contacts = await User.find({ role: otherRole, isActive: true })
    .select('fullName phone specialization isOnline status')
    .sort({ fullName: 1 })
    .limit(200);
  const out = await Promise.all(contacts.map(async (c) => {
    const cid = String(c._id);
    const last = await Chat.find({ order: null, ...directThread(me, cid) }).sort({ createdAt: -1 }).limit(1);
    const unread = await Chat.countDocuments({ order: null, sender: cid, directTo: me, isRead: false });
    return {
      id: cid, name: c.fullName, phone: c.phone,
      specialization: c.specialization || null,
      isOnline: !!c.isOnline, status: c.status || null,
      lastMessage: last[0] ? { content: last[0].content, createdAt: last[0].createdAt, mine: String(last[0].sender) === me } : null,
      unreadCount: unread
    };
  }));
  out.sort((a, b) => (b.unreadCount - a.unreadCount) || ((b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0)));
  ResponseHelper.success(res, out, 'Direct contacts');
});

// GET /api/chat/direct/:userId — thread with one admin/nurse.
const getDirectMessages = asyncHandler(async (req, res) => {
  assertDirectAllowed(req);
  const me = String(req.user.id);
  const other = await User.findById(req.params.userId).select('fullName role isActive');
  if (!other) throw new ApiError(404, 'User not found');
  if (req.user.role === 'admin' && other.role !== 'nurse') throw new ApiError(403, 'Admins can chat directly with nurses');
  if (req.user.role === 'nurse' && other.role !== 'admin') throw new ApiError(403, 'Nurses can chat directly with admins');
  const messages = await Chat.find({ order: null, ...directThread(me, String(other._id)) }).sort({ createdAt: 1 }).limit(300);
  await Chat.updateMany({ order: null, sender: other._id, directTo: me, isRead: false }, { isRead: true, readAt: new Date() });
  ResponseHelper.success(res, { contact: { id: String(other._id), name: other.fullName, role: other.role }, messages: messages.map(shapeMessage) }, 'Direct messages');
});

// POST /api/chat/direct/:userId/send {content}
const sendDirectMessage = asyncHandler(async (req, res) => {
  assertDirectAllowed(req);
  const { content } = req.body;
  if (!content || !String(content).trim()) throw new ApiError(400, 'Message content is required');
  const me = String(req.user.id);
  const other = await User.findById(req.params.userId).select('fullName role isActive');
  if (!other) throw new ApiError(404, 'User not found');
  if (req.user.role === 'admin' && other.role !== 'nurse') throw new ApiError(403, 'Admins can chat directly with nurses');
  if (req.user.role === 'nurse' && other.role !== 'admin') throw new ApiError(403, 'Nurses can chat directly with admins');
  const message = await Chat.create({
    order: null, directTo: other._id,
    sender: me, senderRole: req.user.role,
    content: String(content).trim(), type: 'text'
  });
  try {
    const { emitToUser } = require('../sockets');
    await Notification.create({
      recipient: other._id, title: req.user.role === 'admin' ? 'رسالة من الإدارة' : 'رسالة من ممرض',
      message: String(content).trim().slice(0, 140), type: 'general',
      data: { directFrom: me, directFromRole: req.user.role }
    });
    emitToUser(String(other._id), 'new_direct_message', { from: me, fromRole: req.user.role, content: message.content, createdAt: message.createdAt });
    emitToUser(String(other._id), 'notification', { title: 'رسالة جديدة', directFrom: me });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, shapeMessage(message), 'Message sent', 201);
});

module.exports = { getMessages, getMyChats, sendMessage, sendLocation, getUnreadCount, getDirectContacts, getDirectMessages, sendDirectMessage };
