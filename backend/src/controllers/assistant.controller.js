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

// GET /api/assistant/offers?status= — MASKED nurse-price review queue.
// Same queue the admin sees, but phones/addresses are never included, so a
// helper can pass/reject prices when no admin is available.
const listOffers = asyncHandler(async (req, res) => {
  const { status } = req.query; // pending_review (default, live) | pending_admin (legacy) | approved | rejected | all
  const wanted = status || 'pending_review';
  const orders = await Order.aggregate([
    { $match: { offers: { $exists: true, $not: { $size: 0 } } } },
    { $unwind: '$offers' },
    ...(wanted === 'all' ? [] : [{ $match: { 'offers.status': wanted } }]),
    { $sort: { 'offers.createdAt': -1 } },
    { $limit: 100 },
    {
      $lookup: { from: 'users', localField: 'offers.nurse', foreignField: '_id', as: 'nurseDoc' }
    },
    {
      $lookup: { from: 'users', localField: 'patient', foreignField: '_id', as: 'patientDoc' }
    },
    {
      $lookup: { from: 'services', localField: 'service', foreignField: '_id', as: 'serviceDoc' }
    },
    {
      $project: {
        orderId: '$_id', orderNumber: 1, status: '$status', finalPrice: 1,
        service: { $arrayElemAt: ['$serviceDoc.nameAr', 0] },
        // MASKED: first name only, no phone.
        patient: {
          $let: {
            vars: { p: { $arrayElemAt: ['$patientDoc', 0] } },
            in: { id: '$$p._id', name: '$$p.fullName' }
          }
        },
        offer: {
          id: '$offers._id', price: '$offers.price', status: '$offers.status',
          notes: '$offers.notes', createdAt: '$offers.createdAt',
          nurse: {
            $let: {
              vars: { n: { $arrayElemAt: ['$nurseDoc', 0] } },
              in: { id: '$$n._id', name: '$$n.fullName', rating: '$$n.rating', specialization: '$$n.specialization' }
            }
          }
        }
      }
    }
  ]);
  ResponseHelper.success(res, orders.map((o) => ({
    ...o,
    orderId: String(o.orderId),
    patient: o.patient && o.patient.id ? { ...o.patient, id: String(o.patient.id) } : null,
    offer: { ...o.offer, id: String(o.offer.id), nurse: o.offer.nurse && o.offer.nurse.id ? { ...o.offer.nurse, id: String(o.offer.nurse.id) } : null }
  })), 'Price review queue (masked)');
});

// POST /api/assistant/offers/:orderId/pass {offerId} — pass price to patient
const passOffer = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { offerId } = req.body;
  if (!offerId) throw new ApiError(400, 'offerId is required');
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!['open', 'offers_received'].includes(order.status)) throw new ApiError(400, 'Order is no longer open for pricing');
  const offer = order.offers.id(offerId);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.status === 'pending_review') {
    return ResponseHelper.success(res, { orderId: order._id, offerId, status: offer.status }, 'السعر ظاهر للمريض بالفعل');
  }
  if (offer.status !== 'pending_admin') throw new ApiError(400, 'Offer was already reviewed');
  offer.status = 'pending_review';
  offer.reviewedBy = req.user.id;
  offer.reviewedAt = new Date();
  if (order.status === 'open') order.status = 'offers_received';
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: `Price ${offer.price} passed to patient by assistant` });
  await order.save();
  const Notification = require('../models/Notification');
  const nurseUser = await User.findById(offer.nurse).select('fullName');
  const nurseName = (nurseUser && nurseUser.fullName) || 'ممرض';
  await Notification.create({ recipient: order.patient, title: 'عرض سعر جديد ✅', message: `${nurseName} اقترح ${offer.price} ج.م لطلبك #${order.orderNumber} (راجعه فريقنا) — افتح صفحة الاختيار وقارن بين الممرضين`, type: 'order', data: { orderId: order._id, price: offer.price, nurseId: offer.nurse } });
  await Notification.create({ recipient: offer.nurse, title: 'تم تمرير سعرك للمريض', message: `سعرك ${offer.price} ج.م للطلب #${order.orderNumber} أصبح ظاهراً للمريض الآن`, type: 'order', data: { orderId: order._id } });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, newOffer: { price: offer.price, nurseId: offer.nurse } });
    emitToUser(String(order.patient), 'notification', { title: 'عرض سعر جديد ✅', orderId: order._id, price: offer.price });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, offerId, status: offer.status }, 'تم تمرير السعر للمريض');
});

// POST /api/assistant/offers/:orderId/reject {offerId, notes?}
const rejectOffer = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { offerId, notes } = req.body;
  if (!offerId) throw new ApiError(400, 'offerId is required');
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  const offer = order.offers.id(offerId);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (!['pending_admin', 'pending_review'].includes(offer.status)) throw new ApiError(400, 'Offer is not available');
  offer.status = 'rejected';
  offer.reviewedBy = req.user.id;
  offer.reviewedAt = new Date();
  offer.adminNotes = notes ? String(notes).slice(0, 500) : null;
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: `Assistant rejected price ${offer.price}` });
  await order.save();
  const Notification = require('../models/Notification');
  await Notification.create({ recipient: offer.nurse, title: 'تم رفض سعرك', message: `رفض فريق المراجعة سعرك ${offer.price} ج.م للطلب #${order.orderNumber}${notes ? ' — ' + notes : ''}`, type: 'order', data: { orderId: order._id } });
  ResponseHelper.success(res, { orderId, offerId, status: offer.status }, 'تم رفض العرض وإشعار الممرض');
});

// GET /api/assistant/order-payments — MASKED manual-transfer queue.
// Lets helpers approve upfront InstaPay/Vodafone Cash transfers when no
// admin is around (phones never included).
const listOrderPayments = asyncHandler(async (req, res) => {
  const wallets = await require('../models/Wallet').find({ type: 'payment', status: 'pending' })
    .populate('user', 'fullName')
    .populate('order', 'orderNumber finalPrice patientOfferedPrice amountHeld status')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  ResponseHelper.success(res, wallets.map((t) => ({
    id: String(t._id),
    amount: t.amount,
    paymentMethod: t.paymentMethod,
    reference: t.reference,
    description: t.description,
    createdAt: t.createdAt,
    order: t.order ? {
      id: String(t.order._id), orderNumber: t.order.orderNumber, finalPrice: t.order.finalPrice,
      patientBid: t.order.patientOfferedPrice, amountHeld: t.order.amountHeld, status: t.order.status
    } : null,
    // MASKED: name only, no phone/email.
    user: t.user ? { id: String(t.user._id), name: t.user.fullName } : null
  })), 'Transfer queue (masked)');
});

// POST /api/assistant/order-payments/:paymentId {action: approve|reject}
const reviewOrderPayment = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const raw = req.body.action || req.body.status;
  const approve = (raw === 'approve' || raw === 'approved');
  const Wallet = require('../models/Wallet');
  const Notification = require('../models/Notification');
  const tx = await Wallet.findOne({ _id: paymentId, type: 'payment', status: 'pending' });
  if (!tx) throw new ApiError(404, 'Order payment not found');
  const order = await Order.findById(tx.order);
  if (!order) throw new ApiError(404, 'Order not found');

  if (approve) {
    tx.status = 'completed';
    await tx.save();
    order.paymentStatus = 'paid';
    order.paymentMethod = tx.paymentMethod;
    order.escrowStatus = 'held';
    order.amountHeld = (Number(order.amountHeld) || 0) + Number(tx.amount);
    order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: `Assistant accepted manual transfer (${tx.paymentMethod}) — escrow held` });
    await order.save();

    if (order.status === 'under_review') {
      try {
        const Service = require('../models/Service');
        const serviceDoc = await Service.findById(order.service);
        const { openAndShortlist } = require('../utils/shortlist');
        const gov = (order.location && order.location.governorate) || 'Cairo';
        const base = serviceDoc && serviceDoc.basePrice != null ? Number(serviceDoc.basePrice) : Number(tx.amount);
        await openAndShortlist({ order, serviceDoc, gov, amount: base, actorId: req.user.id, actorNote: 'Assistant approved transfer — request opened' });
      } catch (_) { /* open is best-effort */ }
    }
    try {
      const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
      await releaseEscrowToNurse(order);
    } catch (_) { /* best-effort */ }
    await Notification.create({ recipient: order.patient, title: 'فريقنا قبل تحويلك ✅', message: `قبل فريق المراجعة تحويلك ${tx.amount} ج.م للطلب #${order.orderNumber} — تم تفعيل الطلب`, type: 'order', data: { orderId: order._id } });
    try {
      const { emitToOrder, emitToUser } = require('../sockets');
      emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, paymentStatus: 'paid' });
      emitToUser(String(order.patient), 'notification', { title: 'فريقنا قبل تحويلك ✅', orderId: order._id });
    } catch (_) {}
    return ResponseHelper.success(res, { paymentId, status: tx.status }, 'تم القبول وتفعيل الطلب');
  }

  tx.status = 'failed';
  await tx.save();
  await Notification.create({ recipient: order.patient, title: 'تم رفض التحويل ❌', message: `رفض فريق المراجعة تحويلك ${tx.amount} ج.م للطلب #${order.orderNumber} — تحقق من المرجع وحاول مجدداً`, type: 'order', data: { orderId: order._id } });
  ResponseHelper.success(res, { paymentId, status: tx.status }, 'تم رفض التحويل وإشعار المريض');
});

module.exports = {
  getMe, listUsers, listOrders, toggleStatus, chatContacts, getMessages, sendMessage,
  listOffers, passOffer, rejectOffer,
  listOrderPayments, reviewOrderPayment,
};
