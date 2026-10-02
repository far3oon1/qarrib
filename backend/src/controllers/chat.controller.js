const Order = require('../models/Order');
const Chat = require('../models/Chat');
const ResponseHelper = require('../utils/response');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { getAdminIds } = require('../utils/adminIds');

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
  // 'open' requests (waiting for nurse acceptance) are hidden from patients.
  let query = {};
  if (req.user.role === 'patient') query = { patient: req.user.id, status: { $ne: 'open' } };
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
      const admins = await getAdminIds();
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

// ---------- Direct support chat (no order) ----------
// Admins <-> nurses (always), admins <-> subscribed patients (plan-gated):
// Pro = priority support chat, VIP = 24/7 + dedicated-manager chat.
// Free patients must upgrade (they still have order chats + feedbacks).
const assertDirectAllowed = (req) => {
  if (!['admin', 'nurse', 'patient'].includes(req.user.role)) throw new ApiError(403, 'Direct chat is not available for this account');
};

// Patient side gate: only Pro/VIP may open direct admin threads.
const assertPatientSupportAllowed = (user) => {
  let plan = 'free';
  try { plan = require('./subscription.controller').planOf(user); } catch (_) {}
  if (user.role === 'patient' && plan !== 'pro' && plan !== 'vip') {
    throw new ApiError(403, 'شات الدعم المباشر لمشتركي Pro و VIP — اشترك من صفحة الخطط / Direct admin chat is for Pro & VIP subscribers');
  }
  return plan;
};

const directThread = (uidA, uidB) => ({
  $or: [
    { sender: uidA, directTo: uidB },
    { sender: uidB, directTo: uidA }
  ]
});

// GET /api/chat/direct/contacts
// admin: all nurses + subscribed (Pro/VIP) patients, VIP first.
// nurse: all admins. patient (Pro/VIP only): all admins.
const getDirectContacts = asyncHandler(async (req, res) => {
  assertDirectAllowed(req);
  const me = String(req.user.id);
  let planOf = () => 'free';
  try { ({ planOf } = require('./subscription.controller')); } catch (_) {}
  let contacts = [];
  let kind = 'staff';
  if (req.user.role === 'admin') {
    const [nurses, patients] = await Promise.all([
      User.find({ role: 'nurse', isActive: true }).select('fullName phone specialization isOnline status subscription').sort({ fullName: 1 }).limit(200),
      User.find({ role: 'patient', isActive: true, 'subscription.plan': { $in: ['pro', 'vip'] } }).select('fullName phone isOnline status subscription').sort({ fullName: 1 }).limit(200)
    ]);
    contacts = [
      ...nurses.map((c) => ({ doc: c, kind: 'nurse' })),
      ...patients.filter((p) => planOf(p) === 'pro' || planOf(p) === 'vip').map((c) => ({ doc: c, kind: 'patient' }))
    ];
  } else if (req.user.role === 'patient') {
    assertPatientSupportAllowed(req.user);
    const admins = await User.find({ role: 'admin', isActive: true }).select('fullName phone isOnline status').sort({ fullName: 1 }).limit(20);
    contacts = admins.map((c) => ({ doc: c, kind: 'admin' }));
  } else {
    const admins = await User.find({ role: 'admin', isActive: true }).select('fullName phone specialization isOnline status').sort({ fullName: 1 }).limit(200);
    contacts = admins.map((c) => ({ doc: c, kind: 'admin' }));
  }
  const out = await Promise.all(contacts.map(async ({ doc: c, kind: k }) => {
    const cid = String(c._id);
    const last = await Chat.find({ order: null, ...directThread(me, cid) }).sort({ createdAt: -1 }).limit(1);
    const unread = await Chat.countDocuments({ order: null, sender: cid, directTo: me, isRead: false });
    const cPlan = (c.subscription && c.subscription.plan) || null;
    return {
      id: cid, name: c.fullName, phone: c.phone, kind: k,
      specialization: c.specialization || null,
      isOnline: !!c.isOnline, status: c.status || null,
      plan: cPlan, isVip: cPlan === 'vip' || cPlan === 'nurse_vip',
      lastMessage: last[0] ? { content: last[0].content, createdAt: last[0].createdAt, mine: String(last[0].sender) === me } : null,
      unreadCount: unread
    };
  }));
  out.sort((a, b) => (b.unreadCount - a.unreadCount) || ((b.isVip ? 1 : 0) - (a.isVip ? 1 : 0)) || ((b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0)));
  ResponseHelper.success(res, out, 'Direct contacts');
});

// GET /api/chat/direct/:userId — thread with one admin/nurse/patient.
const getDirectMessages = asyncHandler(async (req, res) => {
  assertDirectAllowed(req);
  const me = String(req.user.id);
  const other = await User.findById(req.params.userId).select('fullName role isActive subscription');
  if (!other) throw new ApiError(404, 'User not found');
  if (req.user.role === 'admin' && !['nurse', 'patient'].includes(other.role)) throw new ApiError(403, 'Admins can chat directly with nurses and subscribed patients');
  if (req.user.role === 'nurse' && other.role !== 'admin') throw new ApiError(403, 'Nurses can chat directly with admins');
  if (req.user.role === 'patient') {
    if (other.role !== 'admin') throw new ApiError(403, 'Patients can chat directly with support admins');
    assertPatientSupportAllowed(req.user);
  }
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
  const other = await User.findById(req.params.userId).select('fullName role isActive subscription');
  if (!other) throw new ApiError(404, 'User not found');
  if (req.user.role === 'admin' && !['nurse', 'patient'].includes(other.role)) throw new ApiError(403, 'Admins can chat directly with nurses and subscribed patients');
  if (req.user.role === 'nurse' && other.role !== 'admin') throw new ApiError(403, 'Nurses can chat directly with admins');
  let senderPlan = null;
  if (req.user.role === 'patient') {
    if (other.role !== 'admin') throw new ApiError(403, 'Patients can chat directly with support admins');
    senderPlan = assertPatientSupportAllowed(req.user);
  }
  const message = await Chat.create({
    order: null, directTo: other._id,
    sender: me, senderRole: req.user.role,
    content: String(content).trim(), type: 'text'
  });
  try {
    const { emitToUser } = require('../sockets');
    const vipIncoming = other.role === 'admin' && senderPlan === 'vip';
    await Notification.create({
      recipient: other._id,
      title: req.user.role === 'admin' ? 'رسالة من الإدارة' : req.user.role === 'nurse' ? 'رسالة من ممرض' : (senderPlan === 'vip' ? '👑 رسالة من مريض VIP' : 'رسالة من مريض مشترك'),
      message: String(content).trim().slice(0, 140), type: 'general',
      data: { directFrom: me, directFromRole: req.user.role }
    });
    emitToUser(String(other._id), 'new_direct_message', { from: me, fromRole: req.user.role, content: message.content, createdAt: message.createdAt });
    emitToUser(String(other._id), 'notification', { title: vipIncoming ? '👑 VIP patient message' : 'رسالة جديدة', directFrom: me });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, shapeMessage(message), 'Message sent', 201);
});

module.exports = { getMessages, getMyChats, sendMessage, sendLocation, getUnreadCount, getDirectContacts, getDirectMessages, sendDirectMessage };
