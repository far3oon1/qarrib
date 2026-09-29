const Order = require('../models/Order');
const Service = require('../models/Service');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { shapeOrder } = require('../utils/orderShape');
const { assertAdminPriced } = require('../utils/adminPricing');
const { findNearestNurses } = require('../utils/nearestNurses');

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
    preferredDate, preferredTime, paymentMethod
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
    serviceDoc = await Service.findOne({ _id: service, isActive: true });
    if (!serviceDoc) throw new ApiError(404, 'Service not found');
  } else {
    // Resolve frontend keys (wound/elderly/iv/...) to catalog names first
    const { resolveServiceType } = require('../utils/serviceCatalog');
    const wanted = serviceType ? resolveServiceType(serviceType) : null;
    if (wanted) {
      serviceDoc = await Service.findOne({ $or: [{ name: wanted.name }, { category: wanted.category }], isActive: true });
    } else if (serviceType) {
      serviceDoc = await Service.findOne({ $or: [{ name: serviceType }, { nameAr: serviceType }], isActive: true });
    } else {
      serviceDoc = await Service.findOne({ isActive: true });
    }
  }
  if (!serviceDoc) throw new ApiError(400, 'This service is not configured by the admin');

  const finalAmount = Number(serviceDoc.basePrice);
  // Admin approval comes first: requests wait in review until the admin
  // approves the service (or sets the price) — unless the service is
  // explicitly marked as not requiring approval.
  const priced = Number.isFinite(finalAmount) && finalAmount > 0;
  const needsApproval = !priced || serviceDoc.requireApproval !== false;
  const openNow = priced && !needsApproval;

  const method = paymentMethod || 'wallet';
  const patient = await User.findById(req.user.id);
  if (method === 'wallet' && openNow && (patient.walletBalance || 0) < finalAmount) {
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
    status: openNow ? 'open' : 'under_review',
    finalPrice: priced ? finalAmount : null,
    commission,
    commissionRate: COMMISSION_RATE,
    nurseEarnings,
    platformFee: commission,
    paymentMethod: priced ? method : null,
    paymentStatus: 'pending',
    escrowStatus: 'none',
    statusHistory: [{ status: openNow ? 'open' : 'under_review', changedBy: req.user.id, notes: openNow ? 'Request created with admin-set service price' : 'Request created — waiting for admin approval' }]
  });

  if (method === 'wallet' && openNow) {
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

  const { notifyNewOrder } = require('../utils/notifyOrder');
  if (openNow) {
    // Approved & priced: visible to nurses immediately (nearest first)
    const { nurses, admins } = await notifyNewOrder({ order, serviceDoc, gov, amount: finalAmount });
    emitOrder(order._id, 'new_order', { orderId: order._id, governorate: gov, amount: finalAmount });
    try {
      const { emitToUser } = require('../sockets');
      nurses.forEach((n) => emitToUser(String(n._id), 'notification', { title: 'طلب جديد متاح', orderId: order._id }));
      admins.forEach((a) => emitToUser(String(a._id), 'notification', { title: 'طلب خدمة جديد', orderId: order._id }));
    } catch (_) { /* sockets optional */ }
  } else {
    // Waiting for admin approval: hidden from nurses until approved
    const admins = await User.find({ role: 'admin' }).select('_id').limit(20);
    for (const a of admins) {
      await Notification.create({
        recipient: a._id, title: 'طلب جديد يحتاج موافقة الإدارة',
        message: `طلب جديد #${order.orderNumber}: ${serviceDoc.nameAr} في ${gov}${priced ? ` — السعر المقترح ${finalAmount} ج.م` : ' — حدد السعر'} ثم اعتمد الخدمة ليظهر للممرضين`,
        type: 'order', data: { orderId: order._id }
      });
    }
    await Notification.create({
      recipient: patient._id, title: 'طلبك قيد مراجعة الإدارة',
      message: `استلمنا طلبك (${serviceDoc.nameAr}) — الإدارة ستراجع وتعتمد الخدمة قريباً ثم يظهر لأقرب الممرضين`,
      type: 'order', data: { orderId: order._id }
    });
  }

  const populated = await Order.findById(order._id).populate('service', 'nameAr basePrice').populate('patient', 'fullName phone');
  ResponseHelper.success(res, shapeOrder(populated), openNow ? 'Request created successfully' : 'تم استلام طلبك — قيد مراجعة الإدارة واعتماد الخدمة', 201);
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
  // A nurse may not take any service before the admin sets its price
  const acceptService = await Service.findById(order.service);
  assertAdminPriced(acceptService);
  order.assignedNurse = req.user.id;
  order.status = 'assigned';
  order.acceptedAt = new Date();
  order.nurseAccepted = true;
  order.nurseAcceptedAt = new Date();
  order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: 'Nurse accepted' });
  await order.save();
  // If the patient already paid (held escrow), it goes straight to this nurse now
  try {
    const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
    await releaseEscrowToNurse(order);
  } catch (_) { /* release is best-effort here */ }
  const nurseName = req.user.fullName || 'The nurse';
  await Notification.create({ recipient: order.patient, title: 'تم قبول طلبك', message: `${nurseName} قبل طلبك #${order.orderNumber} — تتبع وصوله لحظة بلحظة`, type: 'order', data: { orderId: order._id, nurseId: req.user.id } });
  const acceptAdmins = await User.find({ role: 'admin' }).select('_id');
  for (const a of acceptAdmins) {
    await Notification.create({ recipient: a._id, title: 'ممرض قبل طلباً', message: `${nurseName} قبل الطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id, nurseId: req.user.id } });
  }
  emitOrder(order._id, 'order_update', { orderId: order._id, status: 'assigned', nurseId: req.user.id });
  try {
    const { emitToUser } = require('../sockets');
    emitToUser(String(order.patient), 'notification', { title: 'تم قبول طلبك', orderId: order._id });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, await Order.findById(order._id).populate('patient', 'fullName phone'), 'Request accepted successfully');
});

// POST /api/orders/:id/start (nurse arrived)
const startService = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, assignedNurse: req.user.id });
  if (!order) throw new ApiError(404, 'Order not found');
  if (order.status !== 'assigned') throw new ApiError(400, 'Order must be accepted first');
  if (order.nurseAccepted === false) throw new ApiError(400, 'You declined this service');
  if (order.nurseAccepted == null) {
    // Starting implies acceptance for nurses assigned without responding
    order.nurseAccepted = true;
    order.nurseAcceptedAt = new Date();
    order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: 'Nurse accepted by starting service' });
  }
  order.status = 'in_progress';
  order.startedAt = new Date();
  order.statusHistory.push({ status: 'in_progress', changedBy: req.user.id, notes: 'Service started' });
  await order.save();
  await Notification.create({ recipient: order.patient, title: 'بدأت الخدمة', message: 'الممرض بدأ تنفيذ طلبك', type: 'order', data: { orderId: order._id } });
  const startAdmins = await User.find({ role: 'admin' }).select('_id');
  for (const a of startAdmins) {
    await Notification.create({ recipient: a._id, title: 'بدأت خدمة', message: `بدأت خدمة الطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  }
  emitOrder(order._id, 'order_update', { orderId: order._id, status: 'in_progress' });
  ResponseHelper.success(res, { orderId: order._id, status: order.status }, 'Service started');
});

// POST /api/orders/:id/confirm {role} — records each side's confirmation.
// EITHER the nurse or the patient can end the service as completed.
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

  const endedBy = (role === 'patient' || req.user.role === 'patient') ? 'patient' : 'nurse';
  if (endedBy === 'patient') {
    order.patientConfirmed = true;
    order.patientConfirmedAt = new Date();
  } else {
    order.nurseConfirmed = true;
    order.nurseConfirmedAt = new Date();
  }

if (order.status !== 'completed') {
    order.status = 'completed';
    order.completedAt = new Date();
    order.statusHistory.push({ status: 'completed', changedBy: req.user.id, notes: endedBy === 'patient' ? 'Patient ended the service as completed' : 'Nurse confirmed completion' });
  }
  await order.save();

  // Notify the other party + admins about the movement
  const otherId = endedBy === 'patient'
    ? (order.assignedNurse && (order.assignedNurse._id || order.assignedNurse))
    : (order.patient && (order.patient._id || order.patient));
  if (otherId) {
    await Notification.create({
      recipient: otherId,
      title: 'تم إنهاء الخدمة',
      message: endedBy === 'patient' ? `المريض أنهى خدمة الطلب #${order.orderNumber} كمكتملة` : `الممرض أنهى خدمة الطلب #${order.orderNumber} كمكتملة`,
      type: 'order', data: { orderId: order._id }
    });
  }
  const doneAdmins = await User.find({ role: 'admin' }).select('_id');
  for (const a of doneAdmins) {
    await Notification.create({ recipient: a._id, title: 'خدمة مكتملة بانتظار المراجعة', message: `${endedBy === 'patient' ? 'المريض' : 'الممرض'} أنهى الطلب #${order.orderNumber} — راجع الإنجاز واعتمده`, type: 'order', data: { orderId: order._id } });
  }

  if (order.patientConfirmed && order.nurseConfirmed && order.escrowStatus === 'held') {
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const a of admins) {
      await Notification.create({ recipient: a._id, title: 'طلب مراجعة إنجاز', message: `الطلب #${order.orderNumber} جاهز — أكّد الإنجاز لتحويل المبلغ للممرض`, type: 'order', data: { orderId: order._id } });
    }
    try {
      const { emitToOrder } = require('../sockets');
      emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'completed', pendingAdminApproval: true });
    } catch (_) {}
    return ResponseHelper.success(res, { orderId: order._id, status: order.status, pendingAdminApproval: true }, 'تم تأكيد الطرفين! بانتظار مراجعة الإدارة واعتماد الإنجاز.');
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
  // Notify everyone involved about the cancellation movement
  const cancelledBy = req.user.role === 'admin' ? 'الإدارة' : (isPatient ? 'المريض' : 'الممرض');
  const cancelTargets = [];
  if (String(order.patient) !== uid) cancelTargets.push(String(order.patient));
  if (order.assignedNurse && String(order.assignedNurse) !== uid) cancelTargets.push(String(order.assignedNurse));
  for (const t of cancelTargets) {
    await Notification.create({ recipient: t, title: 'تم إلغاء الطلب', message: `${cancelledBy} ألغى الطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  }
  if (req.user.role !== 'admin') {
    const cancelAdmins = await User.find({ role: 'admin' }).select('_id');
    for (const a of cancelAdmins) {
      await Notification.create({ recipient: a._id, title: 'طلب ملغي', message: `${cancelledBy} ألغى الطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
    }
  }
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
    // Requests open for nurses to accept are never shown to the patient
    if (isPatient && !isNurse && order.status === 'open') {
      throw new ApiError(403, 'This request is with nurses for acceptance');
    }
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
  // Patient feedback is also sent to the admin panel + back to the nurse
  if (req.user.role === 'patient') {
    const fbAdmins = await User.find({ role: 'admin' }).select('_id');
    for (const a of fbAdmins) {
      await Notification.create({ recipient: a._id, title: 'تقييم جديد من مريض', message: `المريض قيّم الطلب #${order.orderNumber} بـ ${rating}/5${review ? ' — ' + String(review).slice(0, 120) : ''}`, type: 'general', data: { orderId: order._id, rating, review: review || null } });
    }
    if (order.assignedNurse) {
      await Notification.create({ recipient: order.assignedNurse, title: 'تقييم جديد من مريض', message: `قيّمك المريض ${rating}/5 في الطلب #${order.orderNumber}${review ? ' — ' + String(review).slice(0, 120) : ''}`, type: 'general', data: { orderId: order._id, rating } });
      try {
        const { emitToUser } = require('../sockets');
        emitToUser(String(order.assignedNurse), 'notification', { title: 'تقييم جديد من مريض', orderId: order._id, rating });
      } catch (_) { /* sockets optional */ }
    }
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

  // Assigning a nurse requires an admin-set service price first
  const offerService = await Service.findById(order.service);
  assertAdminPriced(offerService);

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
  // The assigned nurse must confirm OK or decline before starting
  order.nurseAccepted = null;
  order.nurseAcceptedAt = null;
  order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: `Patient approved price ${offer.price}` });
  await order.save();

  // Prepaid escrow (if any) moves straight to the assigned nurse
  try {
    const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
    await releaseEscrowToNurse(order);
  } catch (_) { /* best-effort */ }

  await Notification.create({ recipient: offer.nurse, title: 'تم اختيارك لطلب — أكّد القبول', message: `وافق المريض على سعرك ${offer.price} ج.م للطلب #${order.orderNumber} — افتح طلباتك واضغط "موافق" أو "رفض"`, type: 'order', data: { orderId: order._id } });
  // When admin accepts the nurse price, patient must be told to PAY now
  await Notification.create({ recipient: order.patient, title: 'تم قبول السعر — ادفع الآن', message: `الإدارة قبلت سعر ${offer.price} ج.م لطلبك #${order.orderNumber} — ادفع من المحفظة أو InstaPay ليبدأ الممرض`, type: 'order', data: { orderId: order._id, finalPrice: offer.price } });
  if (req.user.role !== 'admin') {
    const offerAdmins = await User.find({ role: 'admin' }).select('_id');
    for (const a of offerAdmins) {
      await Notification.create({ recipient: a._id, title: 'المريض قبل سعراً', message: `المريض قبل سعر ${offer.price} ج.م للطلب #${order.orderNumber} وعيّن الممرض`, type: 'order', data: { orderId: order._id, finalPrice: offer.price } });
    }
  }
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

  // Direct pay: a nurse is already assigned, so the money goes straight
  // to the nurse's wallet balance immediately.
  const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
  const released = await releaseEscrowToNurse(order);

  if (order.assignedNurse && !released.released) {
    await Notification.create({ recipient: order.assignedNurse, title: 'تم الدفع', message: `تم دفع طلبك #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  }
  const orderAdmins = await User.find({ role: 'admin' }).select('_id');
  for (const a of orderAdmins) {
    await Notification.create({ recipient: a._id, title: 'تم دفع طلب', message: `المريض دفع ${order.finalPrice} ج.م للطلب #${order.orderNumber} (${method})${released.released ? ' — تحوّل مباشرة لرصيد الممرض' : ''}`, type: 'payment', data: { orderId: order._id } });
  }
  ResponseHelper.success(res, { orderId: order._id, escrowStatus: order.escrowStatus, paidToNurse: released.earning || 0 }, released.released ? 'تم الدفع وتحويل المبلغ لرصيد الممرض مباشرة' : 'تم الدفع وحجز المبلغ');
});

// POST /api/orders/:orderId/offer {price, notes?} (nurse suggests a price)
// The patient and the admin can each accept it (approve-offer endpoints).
const submitOffer = asyncHandler(async (req, res) => {
  const orderId = req.params.orderId || req.params.id;
  const price = Number(req.body.price);
  const notes = (req.body.notes || '').trim() || null;
  if (!Number.isFinite(price) || price <= 0) throw new ApiError(400, 'Valid price is required');
  if (req.user.role !== 'nurse') throw new ApiError(403, 'Only nurses can suggest prices');
  if (req.user.status !== 'approved' && req.user.status !== 'active') {
    throw new ApiError(403, 'Your account is not verified yet');
  }
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'Order not found');
  if (!['open', 'offers_received'].includes(order.status)) {
    throw new ApiError(400, 'This request is no longer open for offers');
  }
  const offerService = await Service.findById(order.service);
  assertAdminPriced(offerService);

  const existing = order.offers.find((o) => String(o.nurse) === String(req.user.id) && o.status === 'pending_review');
  if (existing) {
    existing.price = price;
    existing.notes = notes;
  } else {
    order.offers.push({ nurse: req.user.id, price, notes, status: 'pending_review' });
  }
  if (order.status === 'open') order.status = 'offers_received';
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: `Nurse suggested price ${price}` });
  await order.save();

  const nurseName = req.user.fullName || 'A nurse';
  await Notification.create({ recipient: order.patient, title: 'عرض سعر جديد', message: `${nurseName} اقترح ${price} ج.م لطلبك #${order.orderNumber} — راجع العروض واقبل السعر المناسب`, type: 'order', data: { orderId: order._id, price } });
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const a of admins) {
    await Notification.create({ recipient: a._id, title: 'عرض سعر جديد من ممرض', message: `${nurseName} اقترح ${price} ج.م للطلب #${order.orderNumber} — يمكنك قبوله أو اقتراح سعر`, type: 'order', data: { orderId: order._id, price } });
  }
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, newOffer: { price, nurseId: req.user.id } });
    emitToUser(String(order.patient), 'notification', { title: 'عرض سعر جديد', orderId: order._id, price });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, status: order.status, price }, 'تم إرسال سعرك — بانتظار موافقة المريض أو الإدارة');
});

// POST /api/orders/:id/accept-price (patient accepts the admin suggested price)
// Opens the request to nurses (nearest first).
const acceptSuggestedPrice = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (String(order.patient) !== String(req.user.id)) throw new ApiError(403, 'Not authorized');
  if (order.status !== 'price_approved') throw new ApiError(400, 'No suggested price waiting for approval');
  if (order.finalPrice == null) throw new ApiError(400, 'Price is not fixed yet');

  order.status = 'open';
  order.statusHistory.push({ status: 'open', changedBy: req.user.id, notes: `Patient accepted suggested price ${order.finalPrice}` });
  await order.save();

  const { notifyNewOrder } = require('../utils/notifyOrder');
  const serviceDoc = await Service.findById(order.service);
  const gov = (order.location && order.location.governorate) || 'Cairo';
  const { nurses } = await notifyNewOrder({ order, serviceDoc, gov, amount: order.finalPrice, skipAdmins: true });
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const a of admins) {
    await Notification.create({ recipient: a._id, title: 'المريض قبل السعر المقترح', message: `المريض قبل سعر ${order.finalPrice} ج.م للطلب #${order.orderNumber} — ظهر للممرضين`, type: 'order', data: { orderId: order._id } });
  }
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'open', finalPrice: order.finalPrice });
    nurses.forEach((n) => emitToUser(String(n._id), 'notification', { title: 'طلب جديد متاح', orderId: order._id }));
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, status: 'open', finalPrice: order.finalPrice }, 'تم قبول السعر — طلبك ظاهر الآن لأقرب الممرضين');
});

// POST /api/orders/:id/respond {accept: true|false} (assigned nurse says OK or declines)
// The nurse answers an admin/patient-approved assignment at a fixed price.
const respondToAssignment = asyncHandler(async (req, res) => {
  const accept = req.body.accept === true || req.body.accept === 'true' || req.body.accept === 'accept';
  const order = await Order.findById(req.params.id).populate('service', 'nameAr');
  if (!order) throw new ApiError(404, 'Order not found');
  if (!order.assignedNurse || String(order.assignedNurse) !== String(req.user.id)) {
    throw new ApiError(403, 'This service is not assigned to you');
  }
  if (!['assigned'].includes(order.status)) throw new ApiError(400, 'This service is no longer awaiting your response');
  if (order.nurseAccepted === true && accept) {
    return ResponseHelper.success(res, { orderId: order._id, status: order.status, accepted: true }, 'Already accepted');
  }

  const nurseName = req.user.fullName || 'The nurse';
  if (accept) {
    order.nurseAccepted = true;
    order.nurseAcceptedAt = new Date();
    order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: 'Nurse confirmed OK' });
    await order.save();
    // Prepaid escrow moves straight to the confirming nurse
    try {
      const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
      await releaseEscrowToNurse(order);
    } catch (_) { /* best-effort */ }
    await Notification.create({ recipient: order.patient, title: 'الممرض وافق على طلبك', message: `${nurseName} وافق على تنفيذ طلبك #${order.orderNumber} بسعر ${order.finalPrice} ج.م — تتبعه لحظة بلحظة`, type: 'order', data: { orderId: order._id, nurseId: req.user.id } });
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const a of admins) {
      await Notification.create({ recipient: a._id, title: 'الممرض قبل الخدمة', message: `${nurseName} وافق على الطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
    }
    try {
      const { emitToOrder, emitToUser } = require('../sockets');
      emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'assigned', nurseAccepted: true });
      emitToUser(String(order.patient), 'notification', { title: 'الممرض وافق على طلبك', orderId: order._id });
    } catch (_) { /* sockets optional */ }
    return ResponseHelper.success(res, { orderId: order._id, status: order.status, accepted: true }, 'تم قبول الخدمة — توجه للمريض وابدأ التتبع');
  }

  // Decline: free the order back to nurses, keep the offer open for others
  const offer = order.offers.find((o) => o.status === 'approved' && String(o.nurse) === String(req.user.id));
  if (offer) offer.status = 'pending_review';
  order.assignedNurse = null;
  order.selectedOffer = null;
  order.nurseAccepted = null;
  order.nurseAcceptedAt = null;
  const othersWaiting = order.offers.some((o) => o.status === 'pending_review');
  order.status = othersWaiting ? 'offers_received' : 'open';
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: 'Nurse declined the service' });
  await order.save();
  await Notification.create({ recipient: order.patient, title: 'الممرض اعتذر عن طلبك', message: `${nurseName} اعتذر عن الطلب #${order.orderNumber} — نعرضه الآن على ممرضين آخرين`, type: 'order', data: { orderId: order._id } });
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const a of admins) {
    await Notification.create({ recipient: a._id, title: 'ممرض رفض خدمة', message: `${nurseName} رفض الطلب #${order.orderNumber} — عاد للممرضين`, type: 'order', data: { orderId: order._id } });
  }
  try {
    const { emitToOrder } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, nurseDeclined: true });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, status: order.status, accepted: false }, 'تم تسجيل رفضك — عاد الطلب للممرضين');
});

module.exports = { createSimple, acceptOrder, startService, confirmOrder, cancelOrder, getOrderCompat, rateOrder, approveOffer, payManual, submitOffer, acceptSuggestedPrice, respondToAssignment };
