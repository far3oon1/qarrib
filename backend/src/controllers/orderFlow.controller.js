const Order = require('../models/Order');
const Service = require('../models/Service');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { shapeOrder } = require('../utils/orderShape');

const COMMISSION_RATE = 10;

const emitOrder = (orderId, event, data) => {
  try {
    const { emitToOrder, emitToNurses } = require('../sockets');
    if (event === 'new_order') emitToNurses('new_order', data);
    else emitToOrder(String(orderId), event, data);
  } catch (_) { /* sockets optional in tests */ }
};

// POST /api/orders/create  (frontend + voice-note simple flow)
// Money is HELD at creation (wallet) or after Paymob webhook (card).
const createSimple = asyncHandler(async (req, res) => {
  // Accept both shapes: new {governorate, city, lat, lng, amount}
  // and legacy request-service.html {serviceType, location:{lat,lng}, amount|requestedPrice|nursePrice}
  const {
    service, serviceType, description,
    governorate, city, address, lat, lng, location,
    preferredDate, preferredTime, amount, requestedPrice, nursePrice, paymentMethod
  } = req.body;

  const gov = governorate || 'Cairo';
  const cty = city || 'Cairo';
  const cleanAddress = (address || '').trim();
  if (!cleanAddress) {
    throw new ApiError(400, 'address is required');
  }
  const plat = lat != null ? Number(lat) : (location && location.lat != null ? Number(location.lat) : null);
  const plng = lng != null ? Number(lng) : (location && location.lng != null ? Number(location.lng) : null);

  let serviceDoc = null;
  if (service) {
    serviceDoc = await Service.findById(service);
    if (!serviceDoc) throw new ApiError(404, 'Service not found');
  } else if (serviceType) {
    serviceDoc = await Service.findOne({ $or: [{ name: serviceType }, { nameAr: serviceType }], isActive: true });
  } else {
    serviceDoc = await Service.findOne({ isActive: true });
  }
  if (!serviceDoc) {
    // Fallback generic service so the simple flow never blocks on seed data
    serviceDoc = await Service.create({
      name: serviceType || 'home_nursing',
      nameAr: 'تمريض منزلي',
      description: 'General home nursing service',
      category: 'other',
      basePrice: Number(amount || requestedPrice || nursePrice) || 0
    });
  }

  const priceInput = Number(amount || requestedPrice || nursePrice);
  // Owner rule: ONLY an explicit amount or the nurse's offer sets the price.
  // A service basePrice is just a hint and never charges the patient.
  const priced = priceInput > 0;
  const finalAmount = priced ? priceInput : 0;

  const method = paymentMethod || 'wallet';
  const patient = await User.findById(req.user.id);
  if (method === 'wallet' && priced && (patient.walletBalance || 0) < finalAmount) {
    throw new ApiError(400, 'Insufficient wallet balance', [
      { required: finalAmount, available: patient.walletBalance || 0 }
    ]);
  }

  const commission = priced ? Math.round(finalAmount * (COMMISSION_RATE / 100) * 100) / 100 : 0;
  const nurseEarnings = priced ? Math.round((finalAmount - commission) * 100) / 100 : 0;

  const order = await Order.create({
    patient: req.user.id,
    service: serviceDoc._id,
    description: (description || '').trim() || ('طلب خدمة: ' + serviceDoc.nameAr),
    location: {
      governorate: gov, city: cty, address: cleanAddress,
      coordinates: { lat: plat, lng: plng }
    },
    preferredDate: preferredDate ? new Date(preferredDate) : new Date(),
    preferredTime: preferredTime || 'anytime',
    status: 'open',
    finalPrice: priced ? finalAmount : null,
    commission,
    commissionRate: COMMISSION_RATE,
    nurseEarnings,
    platformFee: commission,
    paymentMethod: priced ? method : null,
    paymentStatus: 'pending',
    escrowStatus: 'none',
    statusHistory: [{ status: 'open', changedBy: req.user.id, notes: 'Request created (waiting for nurse price)' }]
  });

  if (method === 'wallet' && priced) {
    patient.walletBalance = (patient.walletBalance || 0) - finalAmount;
    await patient.save();
    await Wallet.create({
      user: patient._id, order: order._id, type: 'payment',
      amount: finalAmount, status: 'completed', paymentMethod: 'wallet',
      description: `Escrow hold for order ${order.orderNumber}`,
      balanceAfter: patient.walletBalance
    });
    order.paymentStatus = 'paid';
    order.escrowStatus = 'held';
    order.statusHistory.push({ status: 'open', changedBy: req.user.id, notes: 'Escrow held (wallet)' });
    await order.save();
  }

  // Notify verified nurses (in-app) + ALL admins + realtime push
  const nurses = await User.find({ role: 'nurse', status: 'approved', isActive: true }).select('_id').limit(50);
  for (const n of nurses) {
    await Notification.create({
      recipient: n._id, title: 'طلب جديد متاح',
      message: `طلب جديد: ${serviceDoc.nameAr} في ${gov}`,
      type: 'order', data: { orderId: order._id }
    });
  }
  const admins = await User.find({ role: 'admin' }).select('_id').limit(20);
  for (const a of admins) {
    await Notification.create({
      recipient: a._id, title: 'طلب خدمة جديد',
      message: `طلب جديد #${order.orderNumber}: ${serviceDoc.nameAr} في ${gov} — بانتظار عرض الممرضين`,
      type: 'order', data: { orderId: order._id }
    });
  }
  emitOrder(order._id, 'new_order', { orderId: order._id, governorate: gov, amount: finalAmount });
  try {
    const { emitToUser } = require('../sockets');
    nurses.forEach((n) => emitToUser(String(n._id), 'notification', { title: 'طلب جديد متاح', orderId: order._id }));
    admins.forEach((a) => emitToUser(String(a._id), 'notification', { title: 'طلب خدمة جديد', orderId: order._id }));
  } catch (_) { /* sockets optional */ }

  const populated = await Order.findById(order._id).populate('service', 'nameAr basePrice').populate('patient', 'fullName phone');
  ResponseHelper.success(res, shapeOrder(populated), 'Request created successfully', 201);
});

// POST /api/orders/:id/accept (nurse, first-come)
const acceptOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!['open', 'offers_received', 'pending'].includes(order.status)) {
    throw new ApiError(400, 'This request has already been accepted or cancelled');
  }
  if (req.user.status !== 'approved' && req.user.status !== 'active') {
    throw new ApiError(403, 'Your account is not verified yet');
  }
  order.assignedNurse = req.user.id;
  order.status = 'assigned';
  order.acceptedAt = new Date();
  order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: 'Nurse accepted' });
  await order.save();
  await Notification.create({ recipient: order.patient, title: 'تم قبول طلبك', message: 'الممرض في الطريق إليك', type: 'order', data: { orderId: order._id } });
  emitOrder(order._id, 'order_update', { orderId: order._id, status: 'assigned', nurseId: req.user.id });
  ResponseHelper.success(res, await Order.findById(order._id).populate('patient', 'fullName phone'), 'Request accepted successfully');
});

// POST /api/orders/:id/start (nurse arrived)
const startService = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, assignedNurse: req.user.id });
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status !== 'assigned') throw new ApiError(400, 'Order must be accepted first');
  order.status = 'in_progress';
  order.startedAt = new Date();
  order.statusHistory.push({ status: 'in_progress', changedBy: req.user.id, notes: 'Service started' });
  await order.save();
  await Notification.create({ recipient: order.patient, title: 'بدأت الخدمة', message: 'الممرض بدأ تنفيذ طلبك', type: 'order', data: { orderId: order._id } });
  emitOrder(order._id, 'order_update', { orderId: order._id, status: 'in_progress' });
  ResponseHelper.success(res, { orderId: order._id, status: order.status }, 'Service started');
});

// POST /api/orders/:id/confirm {role} — records each side's confirmation.
// Money is released ONLY by admin approval (POST /api/admin/orders/:id/complete).
// When both sides confirmed, admins are notified to review & release.
const confirmOrder = asyncHandler(async (req, res) => {
  const role = req.body.role || req.user.role;
  const order = await Order.findById(req.params.id).populate('patient assignedNurse');
  if (!order) throw new ApiError(404, 'Order not found');

  const uid = String(req.user.id);
  const isPatient = order.patient && String(order.patient._id || order.patient) === uid;
  const isNurse = order.assignedNurse && String(order.assignedNurse._id || order.assignedNurse) === uid;
  if (!isPatient && !isNurse) throw new ApiError(403, 'Not authorized for this order');
  if (!['assigned', 'in_progress'].includes(order.status)) throw new ApiError(400, 'Service must be in progress');

  if (role === 'patient' || req.user.role === 'patient') {
    order.patientConfirmed = true;
    order.patientConfirmedAt = new Date();
  }
  if (role === 'nurse' || req.user.role === 'nurse') {
    order.nurseConfirmed = true;
    order.nurseConfirmedAt = new Date();
  }

if (order.nurseConfirmed && order.status !== 'completed') {
    order.status = 'completed';
    order.completedAt = new Date();
    order.statusHistory.push({ status: 'completed', changedBy: req.user.id, notes: 'Nurse confirmed completion' });
  }
  await order.save();

  if (order.patientConfirmed && order.nurseConfirmed && order.escrowStatus === 'held') {
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const a of admins) {
      await Notification.create({ recipient: a._id, title: 'طلب مراجعة إنجاز', message: `الطلب #${order.orderNumber} جاهز — أكّد الإنجاز لتحويل المبلغ للممرض`, type: 'order', data: { orderId: order._id } });
    }
    try {
      const { emitToOrder } = require('../sockets');
      emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'completed', pendingAdminApproval: true });
    } catch (_) {}
    return ResponseHelper.success(res, { orderId: order._id, status: order.status, pendingAdminApproval: true }, 'تم تأكيد الطرفين! بانتظار موافقة الإدارة لتحويل المبلغ.');
  }

  try {
    const { emitToOrder } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, patientConfirmed: order.patientConfirmed, nurseConfirmed: order.nurseConfirmed });
  } catch (_) {}
  ResponseHelper.success(res, { orderId: order._id, status: order.status, patientConfirmed: order.patientConfirmed, nurseConfirmed: order.nurseConfirmed }, 'Confirmation recorded. Waiting for other party.');
});

// POST /api/orders/:id/cancel {reason} — refunds held escrow
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  const uid = String(req.user.id);
  const isPatient = String(order.patient) === uid;
  const isNurse = order.assignedNurse && String(order.assignedNurse) === uid;
  if (!isPatient && !isNurse && req.user.role !== 'admin') throw new ApiError(403, 'Not authorized');
  if (['completed', 'cancelled', 'refunded'].includes(order.status)) throw new ApiError(400, 'Order cannot be cancelled');

  order.status = 'cancelled';
  order.cancelReason = req.body.reason || 'Cancelled by user';
  order.statusHistory.push({ status: 'cancelled', changedBy: req.user.id, notes: order.cancelReason });

  if (order.escrowStatus === 'held') {
    const patient = await User.findById(order.patient);
    const refundAmount = order.finalPrice || 0;
    patient.walletBalance = (patient.walletBalance || 0) + refundAmount;
    await patient.save();
    await Wallet.create({
      user: patient._id, order: order._id, type: 'refund',
      amount: refundAmount, status: 'completed',
      description: `Refund for cancelled order ${order.orderNumber}`,
      balanceAfter: patient.walletBalance
    });
    order.escrowStatus = 'refunded';
    order.paymentStatus = 'refunded';
  }
  await order.save();
  emitOrder(order._id, 'order_update', { orderId: order._id, status: 'cancelled' });
  ResponseHelper.success(res, { orderId: order._id, status: 'cancelled' }, 'Order cancelled successfully');
});

// GET /api/orders/:id (participant or admin)
const getOrderCompat = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('service', 'nameAr basePrice')
    .populate('patient', 'fullName phone')
    .populate('assignedNurse', 'fullName phone rating');
  if (!order) throw new ApiError(404, 'Order not found');
  if (req.user.role !== 'admin') {
    const uid = String(req.user.id);
    const isPatient = String(order.patient._id || order.patient) === uid;
    const isNurse = order.assignedNurse && String(order.assignedNurse._id || order.assignedNurse) === uid;
    if (!isPatient && !isNurse) throw new ApiError(403, 'Not authorized');
  }
  const out = shapeOrder(order);
  ResponseHelper.success(res, out, 'Order details');
});

// POST /api/orders/:id/rate {rating, review}
const rateOrder = asyncHandler(async (req, res) => {
  const { rating, review } = req.body;
  if (!rating || rating < 1 || rating > 5) throw new ApiError(400, 'Rating must be between 1 and 5');
  const order = await Order.findById(req.params.id);
  if (!order || order.status !== 'completed') throw new ApiError(400, 'Order must be completed to rate');

  if (req.user.role === 'patient') {
    order.patientReview = { rating, comment: review || null, createdAt: new Date() };
  } else {
    order.nurseReview = { rating, comment: review || null, createdAt: new Date() };
  }
  await order.save();

  if (req.user.role === 'patient' && order.assignedNurse) {
    const nurse = await User.findById(order.assignedNurse);
    const total = (nurse.totalReviews || 0) + 1;
    const avg = ((nurse.rating || 0) * (nurse.totalReviews || 0) + rating) / total;
    nurse.rating = Math.round(avg * 10) / 10;
    nurse.totalReviews = total;
    await nurse.save();
  }
  ResponseHelper.success(res, { orderId: order._id }, 'Rating submitted successfully');
});

// POST /api/orders/:id/approve-offer {offerId}
// Patient (own order) or admin accepts the nurse's suggested price.
const approveOffer = asyncHandler(async (req, res) => {
  const { offerId } = req.body;
  if (!offerId) throw new ApiError(400, 'offerId is required');
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  const isOwner = String(order.patient) === String(req.user.id);
  if (req.user.role !== 'admin' && !isOwner) throw new ApiError(403, 'Not authorized');
  if (!['open', 'offers_received', 'assigned'].includes(order.status)) {
    throw new ApiError(400, 'Order is no longer open for pricing');
  }

  const offer = order.offers.id(offerId);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.status !== 'pending_review') throw new ApiError(400, 'Offer is not available');

  offer.status = 'approved';
  offer.reviewedAt = new Date();
  order.selectedOffer = offer._id;
  order.finalPrice = offer.price;
  order.commission = Math.round(offer.price * (order.commissionRate / 100) * 100) / 100;
  order.nurseEarnings = Math.round((offer.price - order.commission) * 100) / 100;
  order.platformFee = order.commission;
  order.assignedNurse = offer.nurse;
  order.status = 'assigned';
  order.acceptedAt = order.acceptedAt || new Date();
  order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: `Patient approved price ${offer.price}` });
  await order.save();

  await Notification.create({ recipient: offer.nurse, title: 'تمت الموافقة على سعرك', message: `وافق المريض على سعرك ${offer.price} ج.م`, type: 'order', data: { orderId: order._id } });
  // When admin accepts the nurse price, patient must be told to PAY now
  await Notification.create({ recipient: order.patient, title: 'تم قبول السعر — ادفع الآن', message: `الإدارة قبلت سعر ${offer.price} ج.م لطلبك #${order.orderNumber} — ادفع من المحفظة أو InstaPay ليبدأ الممرض`, type: 'order', data: { orderId: order._id, finalPrice: offer.price } });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'assigned', finalPrice: offer.price });
    emitToUser(String(order.patient), 'notification', { title: 'تم قبول السعر — ادفع الآن', orderId: order._id, finalPrice: offer.price });
    emitToUser(String(offer.nurse), 'notification', { title: 'تمت الموافقة على سعرك', orderId: order._id });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, status: 'assigned', finalPrice: offer.price }, 'تمت الموافقة على السعر');
});

// POST /api/orders/:id/pay {method: 'wallet'|'instapay', reference?}
// wallet: deduct from balance. instapay: patient transferred to OWNER account,
// escrow is held once recorded (owner verifies the transfer off-app).
const payManual = asyncHandler(async (req, res) => {
  const { method, reference } = req.body;
  if (!['wallet', 'instapay'].includes(method)) throw new ApiError(400, 'method must be wallet or instapay');
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (String(order.patient) !== String(req.user.id)) throw new ApiError(403, 'Not authorized');
  if (order.finalPrice == null) throw new ApiError(400, 'Price is not fixed yet');
  if (order.escrowStatus === 'held') throw new ApiError(400, 'Order is already paid');
  if (!['assigned', 'price_approved', 'paid'].includes(order.status)) {
    throw new ApiError(400, 'Order is not ready for payment');
  }

  const patient = await User.findById(req.user.id);
  if (method === 'wallet') {
    if ((patient.walletBalance || 0) < order.finalPrice) throw new ApiError(400, 'Insufficient wallet balance. Please top up first.');
    patient.walletBalance = (patient.walletBalance || 0) - order.finalPrice;
    await patient.save();
    await Wallet.create({
      user: patient._id, order: order._id, type: 'payment',
      amount: order.finalPrice, status: 'completed', paymentMethod: 'wallet',
      description: `Escrow hold for order ${order.orderNumber}`,
      balanceAfter: patient.walletBalance
    });
  } else {
    await Wallet.create({
      user: patient._id, order: order._id, type: 'payment',
      amount: order.finalPrice, status: 'completed', paymentMethod: 'instapay',
      reference: (reference || '').trim() || null,
      description: `InstaPay transfer to owner for order ${order.orderNumber}`,
      balanceAfter: patient.walletBalance || 0
    });
  }

  order.paymentStatus = 'paid';
  order.paymentMethod = method;
  order.escrowStatus = 'held';
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: method === 'wallet' ? 'Escrow held (wallet)' : 'Escrow held (InstaPay to owner)' });
  await order.save();

  if (order.assignedNurse) {
    await Notification.create({ recipient: order.assignedNurse, title: 'تم الدفع', message: `تم دفع طلبك #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  }
  const orderAdmins = await User.find({ role: 'admin' }).select('_id');
  for (const a of orderAdmins) {
    await Notification.create({ recipient: a._id, title: 'تم دفع طلب', message: `المريض دفع ${order.finalPrice} ج.م للطلب #${order.orderNumber} (${method})`, type: 'payment', data: { orderId: order._id } });
  }
  ResponseHelper.success(res, { orderId: order._id, escrowStatus: 'held' }, 'تم الدفع وحجز المبلغ');
});

module.exports = { createSimple, acceptOrder, startService, confirmOrder, cancelOrder, getOrderCompat, rateOrder, approveOffer, payManual };
