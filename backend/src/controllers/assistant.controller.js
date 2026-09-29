// Assistant (helper) workspace — ONLINE, always MASKED.
// Assistants log in with email+password like everyone else and receive a JWT
// with role 'assistant'. Every response here uses assistantView() masking:
// NO nationalId, NO full phone/email, NO payout accounts, NO passwords.
const User = require('../models/User');
const Order = require('../models/Order');
const Chat = require('../models/Chat');
const ResponseHelper = require('../utils/response');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { assistantView, ASSISTANT_SCOPES } = require('../utils/accountView');

// GET /api/assistant/me — my helper profile + ticked policies
const getMe = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id).select('-password');
  if (!me) throw new ApiError(404, 'User not found');
  if (me.role === 'admin') {
    // Admin previewing the helper workspace gets all scopes.
    const { ASSISTANT_SCOPE_KEYS } = require('../utils/accountView');
    return ResponseHelper.success(res, {
      assistant: {
        id: String(me._id), fullName: me.fullName, email: me.email,
        assistantLabel: 'Admin preview',
        assistantScopes: ASSISTANT_SCOPE_KEYS,
        isActive: me.isActive,
      },
      availableScopes: ASSISTANT_SCOPES,
    }, 'Assistant profile');
  }
  if (me.role !== 'assistant') throw new ApiError(403, 'Assistant only');
  ResponseHelper.success(res, {
    assistant: {
      id: String(me._id), fullName: me.fullName, email: me.email,
      assistantLabel: me.assistantLabel || null,
      assistantScopes: Array.isArray(me.assistantScopes) ? me.assistantScopes : [],
      isActive: me.isActive,
    },
    availableScopes: ASSISTANT_SCOPES,
  }, 'Assistant profile');
});

// GET /api/assistant/users?role=&search= — masked account list for helpers
const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, search } = req.query;
  const query = { role: { $in: ['patient', 'nurse'] } };
  if (role && ['patient', 'nurse'].includes(role)) query.role = role;
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      // Assistants search by name only in practice (contacts are masked),
      // but allow the query without leaking plaintext in the response.
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [users, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    User.countDocuments(query),
  ]);
  ResponseHelper.paginated(
    res,
    users.map(assistantView),
    { page: parseInt(page), limit: parseInt(limit), total },
    'Accounts (masked — registration secrets hidden)'
  );
});

// GET /api/assistant/orders — orders without patient/nurse contacts
const listOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const query = {};
  if (status) query.status = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate('patient', 'fullName')
      .populate('service', 'nameAr')
      .populate('assignedNurse', 'fullName')
      .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Order.countDocuments(query),
  ]);
  ResponseHelper.paginated(res, orders.map((o) => ({
    id: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    service: o.service?.nameAr || null,
    patientName: o.patient?.fullName || null,
    nurseName: o.assignedNurse?.fullName || null,
    finalPrice: o.finalPrice ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    // OMITTED on purpose: phones, addresses, coordinates, payout data.
  })), { page: parseInt(page), limit: parseInt(limit), total }, 'Orders (masked)');
});

// PATCH /api/assistant/users/:id/status {isActive} — enable/disable only
const toggleStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || !['patient', 'nurse'].includes(user.role)) throw new ApiError(404, 'Account not found');
  if (req.body.isActive !== undefined) user.isActive = !!req.body.isActive;
  else user.isActive = !user.isActive;
  await user.save();
  ResponseHelper.success(res, { id: String(user._id), isActive: user.isActive }, 'Status updated');
});

// GET /api/assistant/chats/contacts — support chat without sensitive data
const chatContacts = asyncHandler(async (req, res) => {
  const users = await User.find({ role: { $in: ['patient', 'nurse'] }, isActive: true })
    .select('fullName role isOnline')
    .sort({ updatedAt: -1 }).limit(60).lean();
  const me = String(req.user.id);
  const out = await Promise.all(users.map(async (u) => {
    const cid = String(u._id);
    const last = await Chat.find({
      order: null,
      $or: [{ sender: me, directTo: cid }, { sender: cid, directTo: me }],
    }).sort({ createdAt: -1 }).limit(1).lean();
    const unread = await Chat.countDocuments({ order: null, sender: cid, directTo: me, isRead: false });
    return {
      id: cid, name: u.fullName, role: u.role, isOnline: !!u.isOnline,
      lastMessage: last[0] ? { content: last[0].content, createdAt: last[0].createdAt, mine: String(last[0].sender) === me } : null,
      unreadCount: unread,
    };
  }));
  out.sort((a, b) => (b.unreadCount - a.unreadCount) || ((b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0)));
  ResponseHelper.success(res, out, 'Support contacts');
});

const getMessages = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const me = String(req.user.id);
  const other = await User.findById(userId).select('role');
  if (!other || !['patient', 'nurse'].includes(other.role)) throw new ApiError(404, 'Contact not found');
  const msgs = await Chat.find({
    order: null,
    $or: [{ sender: me, directTo: userId }, { sender: userId, directTo: me }],
  }).sort({ createdAt: 1 }).limit(200).lean();
  await Chat.updateMany({ order: null, sender: userId, directTo: me, isRead: false }, { isRead: true, readAt: new Date() });
  ResponseHelper.success(res, msgs.map((m) => ({
    id: String(m._id),
    fromMe: String(m.sender) === me,
    content: m.content,
    type: m.type || 'text',
    createdAt: m.createdAt,
  })), 'Messages');
});

const sendMessage = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { content } = req.body || {};
  if (!content || !String(content).trim()) throw new ApiError(400, 'Message content required');
  const target = await User.findById(userId);
  if (!target || !['patient', 'nurse'].includes(target.role)) throw new ApiError(404, 'Contact not found');
  const msg = await Chat.create({
    order: null,
    directTo: userId,
    sender: req.user.id,
    senderRole: 'assistant',
    content: String(content).trim().slice(0, 2000), type: 'text',
  });
  try {
    const { emitToUser } = require('../sockets');
    emitToUser(String(userId), 'notification', { title: 'رسالة من الدعم' });
  } catch (_) {}
  ResponseHelper.success(res, { id: String(msg._id) }, 'Sent', 201);
});

module.exports = {
  getMe, listUsers, listOrders, toggleStatus, chatContacts, getMessages, sendMessage,
};
