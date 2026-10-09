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
const { pickMatchNurses, MATCH_LIMIT_DEFAULT } = require('../utils/matchNurses');
const { getAdminIds } = require('../utils/adminIds');

const COMMISSION_RATE = 10;

const emitOrder = (orderId, event, data) => {
  try {
    const { emitToOrder, emitToNurses } = require('../sockets');
    if (event === 'new_order') emitToNurses('new_order', data);
    else emitToOrder(String(orderId), event, data);
  } catch (_) { /* sockets optional in tests */ }
};

// POST /api/orders/create  (frontend + voice-note simple flow)
// inDrive-style: patient suggests their own price (never below the admin
// fixed service price) and pays it UPFRONT — wallet is held instantly,
// InstaPay/Vodafone Cash creates a pending transfer the admin/assistant
// must approve before the request opens to nurses.
const createSimple = asyncHandler(async (req, res) => {
  // Accept both shapes: new {governorate, city, lat, lng, amount}
  // and legacy request-service.html {serviceType, location:{lat,lng}, amount|requestedPrice|nursePrice}
  const {
    service, serviceType, description,
    governorate, city, address, lat, lng, location,
    preferredDate, preferredTime, paymentMethod, suggestedPrice, reference
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
  // Retired services (e.g. medical checkup — no doctor) are rejected here
  try {
    const { assertServiceAllowed } = require('../utils/serviceCatalog');
    assertServiceAllowed(serviceDoc, serviceType || service);
  } catch (e) { if (e.statusCode === 400) throw e; }

  const finalAmount = Number(serviceDoc.basePrice);
  // Patient-final rule: a priced service the patient accepts (fixed system
  // price + optional boost, paid upfront) opens at once — NO admin accept
  // needed. Only unpriced services wait for admin pricing.
  const priced = Number.isFinite(finalAmount) && finalAmount > 0;
  const needsApproval = !priced;

  // Patient's own bid: starts from the fixed price, may raise it to get
  // accepted faster — NEVER below the admin fixed price.
  let patientBid = Number(suggestedPrice);
  if (!Number.isFinite(patientBid) || patientBid <= 0) patientBid = priced ? finalAmount : null;
  if (priced && patientBid != null && patientBid < finalAmount) {
    throw new ApiError(400, `عرضك (${patientBid} ج.م) أقل من السعر الثابت للخدمة (${finalAmount} ج.م) — يمكنك تثبيته أو زيادته فقط`, [
      { basePrice: finalAmount, suggested: patientBid }
    ]);
  }

  const method = paymentMethod || 'wallet';
  const isManual = method === 'instapay' || method === 'vodafone_cash';
  if (!['wallet', 'instapay', 'vodafone_cash'].includes(method)) {
    throw new ApiError(400, 'paymentMethod must be wallet, instapay or vodafone_cash');
  }
  const patient = await User.findById(req.user.id);
  // Wallet pays instantly (request opens at once); manual transfers wait for
  // admin/assistant approval on the Payments page before opening.
  const openNow = priced && !needsApproval && method === 'wallet';
  if (method === 'wallet' && priced && (patient.walletBalance || 0) < patientBid) {
    throw new ApiError(400, 'رصيد محفظتك لا يكفي عرضك — اشحنها أو ادفع عبر انستا باي / فودافون كاش', [
      { required: patientBid, available: patient.walletBalance || 0 }
    ]);
  }
  if (isManual && priced && !(reference || '').trim()) {
    throw new ApiError(400, 'اكتب مرجع التحويل (رقم العملية) ليتمكن فريقنا من مراجعته واعتماده');
  }

  const holdAmount = priced ? patientBid : null;
  const commission = priced ? Math.round(holdAmount * (COMMISSION_RATE / 100) * 100) / 100 : 0;
  const nurseEarnings = priced ? Math.round((holdAmount - commission) * 100) / 100 : 0;

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
    finalPrice: holdAmount,
    patientOfferedPrice: holdAmount,
    amountHeld: 0,
    commission,
    commissionRate: COMMISSION_RATE,
    nurseEarnings,
    platformFee: commission,
    paymentMethod: priced ? method : null,
    paymentStatus: 'pending',
    escrowStatus: 'none',
    statusHistory: [{ status: openNow ? 'open' : 'under_review', changedBy: req.user.id, notes: openNow ? `Request created — patient bid ${holdAmount} (base ${finalAmount})` : 'Request created — waiting for admin approval' }]
  });

  if (method === 'wallet' && openNow) {
    patient.walletBalance = (patient.walletBalance || 0) - holdAmount;
    await patient.save();
    await Wallet.create({
      user: patient._id, order: order._id, type: 'payment',
      amount: holdAmount, status: 'completed', paymentMethod: 'wallet',
      description: `Escrow hold for order ${order.orderNumber} (patient bid ${holdAmount}, base ${finalAmount})`,
      balanceAfter: patient.walletBalance
    });
    order.paymentStatus = 'paid';
    order.escrowStatus = 'held';
    order.amountHeld = holdAmount;
    order.statusHistory.push({ status: 'open', changedBy: req.user.id, notes: `Escrow held (wallet) ${holdAmount}` });
    await order.save();
  }

  if (isManual && priced) {
    // Upfront manual payment: held only after admin/assistant approval.
    await Wallet.create({
      user: patient._id, order: order._id, type: 'payment',
      amount: holdAmount, status: 'pending', paymentMethod: method,
      reference: (reference || '').trim(),
      description: `${method === 'vodafone_cash' ? 'Vodafone Cash' : 'InstaPay'} upfront transfer for order ${order.orderNumber} (patient bid ${holdAmount})`,
      balanceAfter: patient.walletBalance || 0
    });
  }

  if (openNow) {
    // Uber/inDrive shortlist: pick 3-4 nearest nurses (online first) and
    // invite ONLY them to counter the patient bid. Shared helper keeps every
    // open path consistent (nurse sees the patient bid + the fixed base).
    const { openAndShortlist } = require('../utils/shortlist');
    const picks = await openAndShortlist({ order, serviceDoc, gov, amount: finalAmount, actorId: req.user.id, actorNote: `Request opened — patient bid ${holdAmount} (base ${finalAmount})` });
    const admins = await getAdminIds();
    const serviceName = serviceDoc.nameAr || serviceDoc.name || 'خدمة تمريض';
    for (const a of admins) {
      await Notification.create({
        recipient: a._id, title: 'طلب خدمة جديد',
        message: `طلب جديد #${order.orderNumber}: ${serviceName} في ${gov} — سعر الطلب ${holdAmount} ج.م (الثابت ${finalAmount}) — رُشح ${picks.length} ممرضين`,
        type: 'order', data: { orderId: order._id, patientBid: holdAmount, basePrice: finalAmount }
      });
    }
    try {
      const { emitToUser } = require('../sockets');
      admins.forEach((a) => emitToUser(String(a._id), 'notification', { title: 'طلب خدمة جديد', orderId: order._id }));
    } catch (_) { /* sockets optional */ }
  } else {
    // Hidden from nurses until approved: either the service itself is
    // unpriced, or the patient paid manually and the transfer awaits
    // admin/assistant approval on the Payments page.
    const admins = await getAdminIds({ limit: 20 });
    const manualPending = isManual && priced;
    for (const a of admins) {
      await Notification.create({
        recipient: a._id,
        title: manualPending ? 'تحويل طلب بانتظار القبول 💰' : 'طلب جديد يحتاج موافقة الإدارة',
        message: manualPending
          ? `${patient.fullName} حوّل ${holdAmount} ج.م مقدماً للطلب #${order.orderNumber} (${method === 'vodafone_cash' ? 'فودافون كاش' : 'InstaPay'}، مرجع: ${(reference || '').trim()}) — عرضه ${holdAmount} (الثابت ${finalAmount}) — اقبل التحويل ليُفتح الطلب للممرضين`
          : `طلب جديد #${order.orderNumber}: ${serviceDoc.nameAr} في ${gov}${priced ? ` — سعر الطلب ${holdAmount} ج.م` : ' — حدد السعر'} ثم اعتمد الخدمة ليظهر للممرضين`,
        type: manualPending ? 'payment' : 'order', data: { orderId: order._id, patientBid: holdAmount }
      });
    }
    // Assistants back up approvals when no admin is around (masked queue).
    try {
      const assistants = await User.find({ role: 'assistant', isActive: true, assistantScopes: { $in: ['manage_orders', 'manage_payments_help'] } }).select('_id').limit(20);
      for (const as of assistants) {
        await Notification.create({
          recipient: as._id,
          title: manualPending ? 'تحويل طلب بانتظار القبول 💰' : 'طلب جديد يحتاج مراجعة',
          message: `طلب #${order.orderNumber}: ${serviceDoc.nameAr} — سعر الطلب ${holdAmount != null ? holdAmount + ' ج.م' : '—'} — راجعه من لوحة المساعد`,
          type: manualPending ? 'payment' : 'order', data: { orderId: order._id }
        });
      }
    } catch (_) { /* assistants optional */ }
    await Notification.create({
      recipient: patient._id,
      title: manualPending ? 'تحويلك قيد مراجعة فريقنا ⏳' : 'طلبك قيد مراجعة الإدارة',
      message: manualPending
        ? `استلمنا تحويلك (${holdAmount} ج.م) لطلب ${serviceDoc.nameAr} — سيُفتح طلبك لأقرب الممرضين فور قبول التحويل`
        : `استلمنا طلبك (${serviceDoc.nameAr}) — الإدارة ستراجع وتعتمد الخدمة قريباً ثم يظهر لأقرب الممرضين`,
      type: 'order', data: { orderId: order._id }
    });
  }

  const populated = await Order.findById(order._id).populate('service', 'nameAr basePrice').populate('patient', 'fullName phone');
  const doneData = shapeOrder(populated);
  const doneMsg = openNow
    ? 'Request created successfully'
    : (isManual && priced ? 'تم إرسال التحويل — سيُفتح طلبك للممرضين بعد قبول فريقنا للتحويل' : 'تم استلام طلبك — قيد مراجعة الإدارة واعتماد الخدمة');
  ResponseHelper.success(res, { ...doneData, pendingTransferApproval: isManual && priced }, doneMsg, 201);
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
  const acceptAdmins = await getAdminIds();
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
  const startAdmins = await getAdminIds();
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
  const doneAdmins = await getAdminIds();
  for (const a of doneAdmins) {
    await Notification.create({ recipient: a._id, title: 'خدمة مكتملة بانتظار المراجعة', message: `${endedBy === 'patient' ? 'المريض' : 'الممرض'} أنهى الطلب #${order.orderNumber} — راجع الإنجاز واعتمده`, type: 'order', data: { orderId: order._id } });
  }

  if (order.patientConfirmed && order.nurseConfirmed && order.escrowStatus === 'held') {
    const admins = await getAdminIds();
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

// POST /api/orders/:id/arrive — assigned nurse taps "I arrived".
// Patient gets a bell alert + live banner on the track page (nurseArrived).
const arriveOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, assignedNurse: req.user.id });
  if (!order) throw new ApiError(404, 'Order not found');
  if (!['assigned', 'in_progress'].includes(order.status)) throw new ApiError(400, 'Order is not active');
  if (order.nurseArrived) {
    return ResponseHelper.success(res, { orderId: order._id, nurseArrived: true, arrivedAt: order.arrivedAt }, 'Arrival already recorded');
  }
  order.nurseArrived = true;
  order.arrivedAt = new Date();
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: 'Nurse arrived at patient location' });
  await order.save();

  await Notification.create({ recipient: order.patient, title: 'الممرض وصل 📍', message: `الممرض وصل إلى موقعك للطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id, arrived: true } });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, nurseArrived: true, arrivedAt: order.arrivedAt });
    emitToUser(String(order.patient), 'notification', { title: 'الممرض وصل 📍', orderId: order._id });
  } catch (_) { /* sockets optional */ }

  ResponseHelper.success(res, { orderId: order._id, nurseArrived: true, arrivedAt: order.arrivedAt }, 'تم تسجيل الوصول — تم إشعار المريض');
});

// POST /api/orders/:id/report {summary} — nurse writes what was done.
// Shown to the admin on the Feedbacks page next to the patient rating.
const submitVisitReport = asyncHandler(async (req, res) => {
  const summary = (req.body.summary || '').toString().trim().slice(0, 2000);
  if (!summary) throw new ApiError(400, 'Report summary is required');
  const order = await Order.findOne({ _id: req.params.id, assignedNurse: req.user.id });
  if (!order) throw new ApiError(404, 'Order not found');
  if (!['in_progress', 'completed'].includes(order.status)) throw new ApiError(400, 'Report can be written during or after the visit');

  order.visitReport = { summary, createdAt: new Date(), by: req.user.id };
  await order.save();

  const reportAdmins = await getAdminIds();
  for (const a of reportAdmins) {
    await Notification.create({ recipient: a._id, title: 'تقرير زيارة جديد 📋', message: `الممرض أرسل تقرير الزيارة للطلب #${order.orderNumber}: ${summary.slice(0, 120)}`, type: 'order', data: { orderId: order._id } });
  }
  try {
    const { emitToOrder } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, visitReport: true });
  } catch (_) { /* sockets optional */ }

  ResponseHelper.success(res, { orderId: order._id, visitReport: order.visitReport }, 'تم إرسال تقرير الزيارة للإدارة');
});

// GET /api/orders/:id/call-quota — read-only: can this user call? (no logging).
// Free plan: no calls. Pro / VIP / VIP-Nurse / Admin: unlimited.
const callQuota = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  const uid = String(req.user.id);
  const isPatient = String(order.patient) === uid;
  const isNurse = order.assignedNurse && String(order.assignedNurse) === uid;
  if (!isPatient && !isNurse) throw new ApiError(403, 'Not authorized for this order');
  const { planOf } = require('./subscription.controller');
  const CallLog = require('../models/CallLog');
  const myPlan = planOf(req.user);
  const unlimited = ['pro', 'vip', 'nurse_vip', 'admin'].includes(myPlan) || req.user.role === 'admin';
  const used = await CallLog.countDocuments({ order: order._id, caller: req.user.id });
  ResponseHelper.success(res, {
    plan: myPlan, unlimited, used,
    remaining: unlimited ? null : 0
  }, 'Call quota');
});

// POST /api/orders/:id/call — subscribers-only in-app calling.
// Free plan: NO calls. Pro / VIP / VIP-Nurse / Admin: unlimited priority calling.
// Respects the callee's call permission (revoked => 403, same as track pages).
const requestCall = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('patient assignedNurse');
  if (!order) throw new ApiError(404, 'Order not found');
  const uid = String(req.user.id);
  const isPatient = order.patient && String(order.patient._id || order.patient) === uid;
  const isNurse = order.assignedNurse && String(order.assignedNurse._id || order.assignedNurse) === uid;
  if (!isPatient && !isNurse) throw new ApiError(403, 'Not authorized for this order');
  if (!['assigned', 'in_progress'].includes(order.status)) throw new ApiError(400, 'Calls are available during an active visit');

  const { effectivePermissions } = require('./permissions.controller');
  const { planOf } = require('./subscription.controller');
  let tel = null;
  let calleeId = null;
  if (isPatient) {
    const nurseDoc = order.assignedNurse;
    if (!nurseDoc) throw new ApiError(400, 'No nurse assigned yet');
    const p = effectivePermissions(nurseDoc);
    if (p.call_nurse === false) throw new ApiError(403, 'Calling is disabled for this nurse by admin');
    tel = nurseDoc.phone || null;
    calleeId = nurseDoc._id || nurseDoc;
  } else {
    const patientDoc = order.patient;
    const p = effectivePermissions(patientDoc);
    if (p.call_patient === false) throw new ApiError(403, 'Calling is disabled for this account by admin');
    tel = patientDoc.phone || null;
    calleeId = patientDoc._id || patientDoc;
  }
  if (!tel) throw new ApiError(400, 'No registered number');

  const CallLog = require('../models/CallLog');
  const myPlan = planOf(req.user);
  const unlimited = ['pro', 'vip', 'nurse_vip', 'admin'].includes(myPlan) || req.user.role === 'admin';
  if (!unlimited) {
    throw new ApiError(403, 'الاتصال للمشتركين فقط — اشترك في Pro أو VIP للاتصال / Calling is for subscribers only — upgrade to Pro or VIP to call');
  }
  const used = await CallLog.countDocuments({ order: order._id, caller: req.user.id });
  await CallLog.create({ order: order._id, caller: req.user.id, callerRole: isPatient ? 'patient' : 'nurse' });

  try {
    await Notification.create({
      recipient: calleeId, title: '📞 مكالمة واردة',
      message: `مكالمة واردة في الطلب #${order.orderNumber} من ${isPatient ? 'المريض' : 'الممرض'}`,
      type: 'general', data: { orderId: order._id }
    });
    const { emitToUser } = require('../sockets');
    emitToUser(String(calleeId), 'notification', { title: '📞 مكالمة واردة', orderId: order._id });
  } catch (_) {}

  ResponseHelper.success(res, {
    tel, plan: myPlan, unlimited,
    remaining: null,
    calleeId: String(calleeId),
    calleeName: isPatient ? (nurseDoc.name || 'الممرض') : (patientDoc.name || 'المريض')
  }, 'Calling…');
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
    // Refund exactly what was secured (bid + any settled top-ups)
    const refundAmount = (Number(order.amountHeld) || 0) > 0 ? Number(order.amountHeld) : (order.finalPrice || 0);
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
    order.amountHeld = 0;
  } else {
    // No held money but a manual transfer may still be awaiting review —
    // fail it so it can't be approved after cancellation.
    try {
      const Wallet = require('../models/Wallet');
      await Wallet.updateMany({ order: order._id, type: 'payment', status: 'pending' }, { status: 'failed' });
    } catch (_) { /* ledger best-effort */ }
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
    const cancelAdmins = await getAdminIds();
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
    .populate('patient', 'fullName phone locationSharing permissions consents subscription')
    .populate('assignedNurse', 'fullName phone rating locationSharing permissions consents subscription');
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
  // --- Trusted nurse badge (VIP Nurse plan) ---
  try {
    const { isTrustedNurse } = require('./subscription.controller');
    if (out.nurse) {
      out.nurse.isTrusted = !!(order.assignedNurse && isTrustedNurse(order.assignedNurse));
      delete out.nurse.subscription;
    }
    if (out.patient) delete out.patient.subscription;
    if (Array.isArray(out.offers)) out.offers.forEach((x) => { if (x.nurse) delete x.nurse.subscription; });
  } catch (_) { /* badge is best-effort */ }
  // --- Online location permission gate ---
  // Live dots + registered phone numbers are only exposed when the OWNER
  // approved sharing (account → location toggle, or admin GUI approval).
  try {
    const nurseDoc = order.assignedNurse;
    const patientDoc = order.patient;
    const nurseShare = !nurseDoc || (nurseDoc.locationSharing?.shareLiveLocation !== false && nurseDoc.locationSharing?.approvedByAdmin !== false && nurseDoc.locationSharing?.shareWithPatient !== false);
    const patientShare = !patientDoc || (patientDoc.locationSharing?.shareLiveLocation !== false && patientDoc.locationSharing?.approvedByAdmin !== false && patientDoc.locationSharing?.shareWithNurse !== false);
    if (!nurseShare) {
      out.nurseLiveLocation = null;
      if (out.nurse) { out.nurse.shareLiveLocation = false; }
    }
    if (!patientShare) {
      out.patientLiveLocation = null;
      if (out.patient) { out.patient.shareLiveLocation = false; }
    }
    // Call permission: hide phone numbers when the owner revoked calling
    const { effectivePermissions } = require('./permissions.controller');
    if (nurseDoc) {
      const p = effectivePermissions(nurseDoc);
      out.nurseCanCall = p.call_nurse !== false && p.call_patient !== false;
      if (p.call_nurse === false && req.user.role === 'patient') {
        if (out.nurse) { out.nurse.phone = null; out.nurse.callDisabled = true; }
      }
    }
    if (patientDoc) {
      const p = effectivePermissions(patientDoc);
      if (p.call_patient === false && req.user.role === 'nurse') {
        if (out.patient) { out.patient.phone = null; out.patient.callDisabled = true; }
      }
    }
    out.locationSharing = { nurseShare: !!nurseShare, patientShare: !!patientShare };
  } catch (_) { /* gating is best-effort */ }
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
    const fbAdmins = await getAdminIds();
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
  // Patient-first: any live price is acceptable, no admin wait.
  if (!['pending_review', 'pending_admin'].includes(offer.status)) throw new ApiError(400, 'Offer is not available');

  // Assigning a nurse requires an admin-set service price first
  const offerService = await Service.findById(order.service);
  assertAdminPriced(offerService);
  // inDrive rule: accept only same-or-higher than the fixed system price
  const { adminPriceOf } = require('../utils/adminPricing');
  const floor = adminPriceOf(offerService);
  if (floor != null && Number(offer.price) < floor) {
    throw new ApiError(400, `لا يمكن قبول ${offer.price} ج.م — أقل من السعر الثابت (${floor} ج.م)`);
  }

  offer.status = 'approved';
  offer.reviewedAt = new Date();
  order.selectedOffer = offer._id;
  // Upfront-bid settle: patient already secured amountHeld at request time —
  // charge only the extra (or refund the excess) straight to platform hold.
  const settlePatient = await User.findById(order.patient);
  const { settleAcceptPrice } = require('../utils/settlePrice');
  const settled = await settleAcceptPrice({ order, patient: settlePatient, acceptedPrice: offer.price });
  order.assignedNurse = offer.nurse;
  order.status = 'assigned';
  order.acceptedAt = order.acceptedAt || new Date();
  // The assigned nurse must confirm OK or decline before starting
  order.nurseAccepted = null;
  order.nurseAcceptedAt = null;
  (order.matchedNurses || []).forEach((m) => {
    if (String(m.nurse) === String(offer.nurse)) m.status = 'chosen';
  });
  order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: `Patient approved price ${offer.price}` });
  await order.save();

  // Prepaid escrow (if any) moves straight to the assigned nurse
  try {
    const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
    await releaseEscrowToNurse(order);
  } catch (_) { /* best-effort */ }

  await Notification.create({ recipient: offer.nurse, title: 'تم اختيارك لطلب — أكّد القبول', message: `وافق المريض على سعرك ${offer.price} ج.م للطلب #${order.orderNumber} — افتح طلباتك واضغط "موافق" أو "رفض"`, type: 'order', data: { orderId: order._id } });
  // Money was secured upfront at request time — settle moved only the
  // difference, so the patient just gets a receipt (no separate pay step).
  const settleNote = settled.diff > 0
    ? ` — تم خصم فرق السعر ${settled.diff} ج.م من محفظتك تلقائياً`
    : (settled.diff < 0 ? ` — تم إرجاع ${Math.abs(settled.diff)} ج.م لمحفظتك (السعر المقبول أقل)` : ' — المبلغ كان محجوزاً مقدماً');
  await Notification.create({ recipient: order.patient, title: 'تم قبول السعر ✅', message: `تم قبول سعر ${offer.price} ج.م لطلبك #${order.orderNumber}${settleNote}`, type: 'order', data: { orderId: order._id, finalPrice: offer.price } });
  if (req.user.role !== 'admin') {
    const offerAdmins = await getAdminIds();
    for (const a of offerAdmins) {
      await Notification.create({ recipient: a._id, title: 'المريض قبل سعراً', message: `المريض قبل سعر ${offer.price} ج.م للطلب #${order.orderNumber} وعيّن الممرض`, type: 'order', data: { orderId: order._id, finalPrice: offer.price } });
    }
  }
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'assigned', finalPrice: offer.price });
    emitToUser(String(order.patient), 'notification', { title: 'تم قبول السعر ✅', orderId: order._id, finalPrice: offer.price });
    emitToUser(String(offer.nurse), 'notification', { title: 'تمت الموافقة على سعرك', orderId: order._id });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, status: 'assigned', finalPrice: offer.price, settledDiff: settled.diff }, settled.diff > 0 ? `تمت الموافقة — خُصم فرق السعر ${settled.diff} ج.م من المحفظة` : 'تمت الموافقة على السعر');
});

// POST /api/orders/:id/pay {method: 'wallet'|'instapay'|'vodafone_cash', reference?}
// wallet: deduct from balance. instapay/vodafone_cash: patient transferred to
// the OWNER account, escrow is held once recorded (owner verifies off-app).
const payManual = asyncHandler(async (req, res) => {
  const { method, reference } = req.body;
  if (!['wallet', 'instapay', 'vodafone_cash'].includes(method)) throw new ApiError(400, 'method must be wallet, instapay or vodafone_cash');
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (String(order.patient) !== String(req.user.id)) throw new ApiError(403, 'Not authorized');
  if (order.finalPrice == null) throw new ApiError(400, 'Price is not fixed yet');
  // Double-pay armor: if ANY money is already secured for this order, refuse
  // another payment with a clear warning — nobody can trick the patient
  // into paying twice (checked three independent ways).
  const alreadyPaidWarning = '⚠️ دفعت هذا الطلب من قبل — المبلغ محجوز ولن يتم الخصم مرة أخرى / Already paid — amount is secured, no second charge';
  if (['held', 'released'].includes(order.escrowStatus)) throw new ApiError(400, alreadyPaidWarning);
  if ((Number(order.amountHeld) || 0) > 0) throw new ApiError(400, alreadyPaidWarning);
  const priorPaid = await Wallet.findOne({ order: order._id, user: req.user.id, type: 'payment', status: 'completed' });
  if (priorPaid) throw new ApiError(400, alreadyPaidWarning);
  // Payment is allowed in any pre-completion state (open/under_review/offers_received/
  // price_approved/assigned/paid/in_progress). Without a nurse yet the money is
  // simply held and released straight to the nurse on assignment.
  if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
    throw new ApiError(400, 'Order is closed');
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
    // Manual transfer (InstaPay / Vodafone Cash to the owner account):
    // NOTHING is credited until the admin accepts it on the Payments page.
    const dup = await Wallet.findOne({ order: order._id, type: 'payment', status: 'pending' });
    if (dup) throw new ApiError(400, 'لديك تحويل معلق قيد مراجعة الإدارة — انتظر القبول');
    const vfCash = method === 'vodafone_cash';
    const tx = await Wallet.create({
      user: patient._id, order: order._id, type: 'payment',
      amount: order.finalPrice, status: 'pending', paymentMethod: vfCash ? 'vodafone_cash' : 'instapay',
      reference: (reference || '').trim() || null,
      description: vfCash ? `Vodafone Cash transfer to owner for order ${order.orderNumber}` : `InstaPay transfer to owner for order ${order.orderNumber}`,
      balanceAfter: patient.walletBalance || 0
    });
    const payAdmins = await getAdminIds();
    for (const a of payAdmins) {
      await Notification.create({ recipient: a._id, title: 'تحويل طلب بانتظار القبول 💰', message: `${patient.fullName} حوّل ${order.finalPrice} ج.م للطلب #${order.orderNumber} (${vfCash ? 'فودافون كاش' : 'InstaPay'}، مرجع: ${(reference || '').trim() || '—'}) — اقبل التحويل لتفعيل الطلب`, type: 'payment', data: { orderId: order._id, paymentId: tx._id } });
    }
    try {
      const { emitToUser } = require('../sockets');
      payAdmins.forEach((a) => emitToUser(String(a._id), 'notification', { title: 'تحويل طلب بانتظار القبول', orderId: order._id }));
    } catch (_) {}
    return ResponseHelper.success(res, { orderId: order._id, escrowStatus: order.escrowStatus, pendingAdminApproval: true, paymentId: tx._id }, 'تم إرسال التحويل — سيُفعّل الطلب بعد قبول الإدارة');
  }

  order.paymentStatus = 'paid';
  order.paymentMethod = method;
  order.escrowStatus = 'held';
  order.amountHeld = order.finalPrice;
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: method === 'wallet' ? 'Escrow held (wallet)' : method === 'vodafone_cash' ? 'Escrow held (Vodafone Cash to owner)' : 'Escrow held (InstaPay to owner)' });
  await order.save();

  // Direct pay: a nurse is already assigned, so the money goes straight
  // to the nurse's wallet balance immediately.
  const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
  const released = await releaseEscrowToNurse(order);

  if (order.assignedNurse && !released.released) {
    await Notification.create({ recipient: order.assignedNurse, title: 'تم الدفع', message: `تم دفع طلبك #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  }
  const orderAdmins = await getAdminIds();
  for (const a of orderAdmins) {
    await Notification.create({ recipient: a._id, title: 'تم دفع طلب', message: `المريض دفع ${order.finalPrice} ج.م للطلب #${order.orderNumber} (${method})${released.released ? ' — تحوّل مباشرة لرصيد الممرض' : ''}`, type: 'payment', data: { orderId: order._id } });
  }
  ResponseHelper.success(res, { orderId: order._id, escrowStatus: order.escrowStatus, paidToNurse: released.earning || 0 }, released.released ? 'تم الدفع وتحويل المبلغ لرصيد الممرض مباشرة' : 'تم الدفع وحجز المبلغ');
});

// POST /api/orders/:orderId/offer {price, notes?} (nurse suggests a price)
// PATIENT-FIRST flow: the price goes STRAIGHT to the patient, who accepts
// or rejects with no admin wait. Admin/assistant see every offer and may
// reject a bad one or assign if the patient does not act.
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
  // inDrive floor: a nurse price can equal the fixed system price or be
  // higher — never lower (the patient can only accept same-or-higher).
  const { adminPriceOf } = require('../utils/adminPricing');
  const floor = adminPriceOf(offerService);
  if (floor != null && price < floor) {
    throw new ApiError(400, `سعرك (${price} ج.م) أقل من السعر الثابت للخدمة (${floor} ج.م) — يجب أن يساويه أو يزيد عنه`);
  }

  // Patient-first rule: a nurse price goes STRAIGHT to the patient, who
  // can accept it with no admin approval. Admin/assistant still see every
  // offer (FYI notification) and may reject a bad price or assign a nurse
  // themselves if the patient does not act.
  const existing = order.offers.find((o) => String(o.nurse) === String(req.user.id) && ['pending_admin', 'pending_review'].includes(o.status));
  if (existing) {
    existing.price = price;
    existing.notes = notes;
    existing.status = 'pending_review';
    existing.createdAt = new Date();
    existing.reviewedAt = new Date();
  } else {
    order.offers.push({ nurse: req.user.id, price, notes, status: 'pending_review' });
  }
  const matchEntry = (order.matchedNurses || []).find((m) => String(m.nurse) === String(req.user.id));
  if (matchEntry && matchEntry.status === 'pending') {
    matchEntry.status = 'offered';
    matchEntry.respondedAt = new Date();
  }
  if (order.status === 'open') order.status = 'offers_received';
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: `Nurse suggested price ${price} (straight to patient)` });
  await order.save();

  const nurseName = req.user.fullName || 'A nurse';
  const admins = await getAdminIds();
  for (const a of admins) {
    await Notification.create({ recipient: a._id, title: 'عرض سعر جديد 👀', message: `${nurseName} اقترح ${price} ج.م للطلب #${order.orderNumber} — ظهر للمريض مباشرة (يقبل بدون إدارة) — يمكنك رفضه أو تعيين الممرض لو المريض لم يتصرف`, type: 'order', data: { orderId: order._id, price } });
  }
  // Assistants with order scope act when no admin is around — ping them too.
  // (Masked: they see the price + masked names, never contacts.)
  try {
    const assistants = await User.find({ role: 'assistant', isActive: true, assistantScopes: 'manage_orders' }).select('_id').limit(20);
    for (const as of assistants) {
      await Notification.create({ recipient: as._id, title: 'عرض سعر يحتاج مراجعة 💰', message: `${nurseName} اقترح ${price} ج.م للطلب #${order.orderNumber} — راجعه ومرّره للمريض`, type: 'order', data: { orderId: order._id, price } });
    }
  } catch (_) { /* assistants optional */ }
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, newOffer: { price, nurseId: req.user.id } });
    emitToUser(String(order.patient), 'notification', { title: 'عرض سعر جديد ✅', orderId: order._id, price });
    admins.forEach((a) => {
      try { emitToUser(String(a._id), 'notification', { title: 'عرض سعر جديد', orderId: order._id, price }); } catch (_) {}
    });
  } catch (_) { /* sockets optional */ }
  await Notification.create({ recipient: order.patient, title: 'عرض سعر جديد ✅', message: `${nurseName} اقترح ${price} ج.م لطلبك #${order.orderNumber} — قارن واقبل أو ارفض من صفحة الاختيار (بدون انتظار الإدارة)`, type: 'order', data: { orderId: order._id, price, nurseId: req.user.id } });
  try { require('../utils/audit').logEvent(req, 'offer.submit', { targetType: 'order', targetId: String(order._id), details: `nurse ${nurseName} offered ${price} EGP on #${order.orderNumber} (straight to patient)` }); } catch (_) {}
  ResponseHelper.success(res, { orderId: order._id, status: order.status, price }, 'تم إرسال سعرك للمريض مباشرة');
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
  if (order.patientOfferedPrice == null) order.patientOfferedPrice = order.finalPrice;
  await order.save();

  const serviceDoc = await Service.findById(order.service);
  const gov = (order.location && order.location.governorate) || 'Cairo';
  // Shared shortlist (patient bid + fixed base shown to nurses)
  const { openAndShortlist } = require('../utils/shortlist');
  await openAndShortlist({ order, serviceDoc, gov, amount: Number(serviceDoc.basePrice) || order.finalPrice, actorId: req.user.id, actorNote: `Patient accepted suggested price ${order.finalPrice}` });
  const admins = await getAdminIds();
  for (const a of admins) {
    await Notification.create({ recipient: a._id, title: 'المريض قبل السعر المقترح', message: `المريض قبل سعر ${order.finalPrice} ج.م للطلب #${order.orderNumber} — ظهر للممرضين`, type: 'order', data: { orderId: order._id } });
  }
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
    const admins = await getAdminIds();
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
  const admins = await getAdminIds();
  for (const a of admins) {
    await Notification.create({ recipient: a._id, title: 'ممرض رفض خدمة', message: `${nurseName} رفض الطلب #${order.orderNumber} — عاد للممرضين`, type: 'order', data: { orderId: order._id } });
  }
  try {
    const { emitToOrder } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, nurseDeclined: true });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, status: order.status, accepted: false }, 'تم تسجيل رفضك — عاد الطلب للممرضين');
});

// POST /api/orders/:id/complete-cash {cashReceived: true, amount?} (assigned nurse only)
// Nurse ends the visit when the patient hands over the cash balance.
const completeCash = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('patient assignedNurse');
  if (!order) throw new ApiError(404, 'Order not found');
  const uid = String(req.user.id);
  const isNurse = order.assignedNurse && String(order.assignedNurse._id || order.assignedNurse) === uid;
  if (!isNurse) throw new ApiError(403, 'Only the assigned nurse can close this visit');
  if (!['assigned', 'in_progress'].includes(order.status)) throw new ApiError(400, 'Service must be in progress');
  if (req.body.cashReceived !== true && req.body.cashReceived !== 'true') {
    throw new ApiError(400, 'Confirm that you received the cash balance');
  }
  const cashAmount = req.body.amount != null ? Number(req.body.amount) : Number(order.finalPrice || 0);
  order.nurseConfirmed = true;
  order.nurseConfirmedAt = new Date();
  order.status = 'completed';
  order.completedAt = new Date();
  order.paymentMethod = order.paymentMethod || 'cash';
  order.paymentStatus = 'paid';
  order.escrowStatus = order.escrowStatus === 'held' ? order.escrowStatus : 'none';
  order.statusHistory.push({ status: 'completed', changedBy: req.user.id, notes: `Nurse received cash ${cashAmount} EGP and ended service` });
  await order.save();

  // REAL plan perk: Pro 5% / VIP 10% visit cashback to the patient wallet
  try { await require('./subscription.controller').grantVisitCashback(order); } catch (_) {}

  const otherId = order.patient && (order.patient._id || order.patient);
  if (otherId) {
    await Notification.create({
      recipient: otherId, title: 'تم إنهاء الخدمة — تم استلام المبلغ',
      message: `الممرض أنهى الزيارة واستلم ${cashAmount} ج.م نقداً للطلب #${order.orderNumber} — قيّمه بالنجوم`, type: 'order', data: { orderId: order._id, cashAmount }
    });
  }
  const doneAdmins = await getAdminIds();
  for (const a of doneAdmins) {
    await Notification.create({ recipient: a._id, title: 'خدمة مكتملة نقداً', message: `الممرض استلم ${cashAmount} ج.م نقداً وأنهى الطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id, cashAmount } });
  }
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'completed', cashReceived: true, cashAmount });
    if (otherId) emitToUser(String(otherId), 'notification', { title: 'تم إنهاء الخدمة — قيّم الممرض', orderId: order._id });
  } catch (_) {}
  ResponseHelper.success(res, { orderId: order._id, status: 'completed', cashAmount }, 'تم إنهاء الخدمة بعد استلام المبلغ نقداً');
});

// ---------- Uber/inDrive shortlist: patient picks 1 of 3-4 matched nurses ----------

// GET /api/orders/:id/matches (patient owner or admin)
// inDrive-style board: the ⭐ shortlist PLUS every other nurse who sent a
// passed price (any nurse in the area can counter — patient accepts/rejects).
// Each candidate: profile + rating + patient feedback + own price (only after
// it is passed — auto-passed when prepaid, else by admin/assistant).
const getMatches = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('service', 'nameAr basePrice')
    .populate('matchedNurses.nurse', 'fullName rating totalReviews specialization yearsOfExperience bio isOnline location subscription');
  if (!order) throw new ApiError(404, 'Order not found');
  const uid = String(req.user.id);
  const isOwner = String(order.patient) === uid;
  if (req.user.role !== 'admin' && !isOwner) throw new ApiError(403, 'Not authorized');

  let trustedFn = null;
  try { trustedFn = require('./subscription.controller').isTrustedNurse; } catch (_) {}

  const buildCard = async (n, extra) => {
    const nid = String((n && n._id) || (extra && extra.nurseId) || '');
    // Patient-first: EVERY price is visible with its price — no offer ever
    // waits for admin before the patient sees it (legacy pending_admin rows
    // included, so nothing can get stuck "under review" again).
    const nurseOffers = (order.offers || []).filter((o) => String(o.nurse) === nid);
    const passed = nurseOffers.filter((o) => ['pending_review', 'pending_admin'].includes(o.status)).slice(-1)[0] || null;
    const waiting = null;
    // Recent patient feedback about this nurse (last 5 completed visits)
    let reviews = [];
    try {
      const done = await Order.find({ assignedNurse: nid, status: 'completed', 'patientReview.rating': { $ne: null } })
        .populate('patient', 'fullName')
        .sort({ completedAt: -1, updatedAt: -1 })
        .limit(5)
        .lean();
      reviews = done.map((d) => ({
        rating: d.patientReview.rating,
        comment: d.patientReview.comment || null,
        patientName: (d.patient && d.patient.fullName) || 'مريض',
        createdAt: d.patientReview.createdAt || d.completedAt || d.updatedAt
      }));
    } catch (_) { reviews = []; }
    const loc = (n && n.location) || {};
    return {
      nurseId: nid,
      name: (n && n.fullName) || 'ممرض',
      rating: (n && n.rating) ?? 0,
      totalReviews: (n && n.totalReviews) ?? 0,
      specialization: (n && n.specialization) || null,
      yearsOfExperience: (n && n.yearsOfExperience) ?? 0,
      bio: (n && n.bio) || null,
      isOnline: !!(n && n.isOnline),
      isTrusted: trustedFn && n ? !!trustedFn(n) : false,
      governorate: loc.governorate || null,
      city: loc.city || null,
      distanceKm: (extra && extra.distanceKm) ?? null,
      matchStatus: (extra && extra.matchStatus) || 'offered',
      shortlisted: !!(extra && extra.shortlisted),
      offerId: passed ? String(passed._id) : null,
      offerPrice: passed ? passed.price : null,
      offerStatus: passed ? passed.status : null,
      waitingAdminReview: false,
      offerNotes: passed ? (passed.notes || null) : null,
      reviews
    };
  };

  const seen = new Set();
  const matches = [];
  for (const m of (order.matchedNurses || [])) {
    const nid = String((m.nurse && m.nurse._id) || m.nurse);
    if (seen.has(nid)) continue;
    seen.add(nid);
    matches.push(await buildCard(m.nurse, { distanceKm: m.distanceKm ?? null, matchStatus: m.status, shortlisted: true }));
  }
  // Extra nurses (beyond the shortlist) that sent any live price
  const extraIds = [...new Set((order.offers || [])
    .filter((o) => ['pending_review', 'pending_admin'].includes(o.status))
    .map((o) => String(o.nurse)))].filter((id) => !seen.has(id));
  if (extraIds.length) {
    const extras = await User.find({ _id: { $in: extraIds } })
      .select('fullName rating totalReviews specialization yearsOfExperience bio isOnline location subscription');
    for (const n of extras) {
      seen.add(String(n._id));
      matches.push(await buildCard(n, { distanceKm: null, matchStatus: 'offered', shortlisted: false }));
    }
  }

  ResponseHelper.success(res, {
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    service: order.service ? { id: String(order.service._id || order.service), nameAr: order.service.nameAr, basePrice: order.service.basePrice } : null,
    adminBasePrice: order.finalPrice ?? (order.service ? order.service.basePrice : null),
    patientBid: order.patientOfferedPrice ?? null,
    amountHeld: order.amountHeld || 0,
    matchRound: order.matchRound || 0,
    matches
  }, 'Matched nurses');
});

// POST /api/orders/:id/matches/refresh (patient: replace list with new nurses)
const refreshMatches = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (String(order.patient) !== String(req.user.id)) throw new ApiError(403, 'Not authorized');
  if (!['open', 'offers_received'].includes(order.status)) throw new ApiError(400, 'This request is no longer open');

  const everMatched = (order.matchedNurses || []).map((m) => String(m.nurse));
  if (order.assignedNurse) everMatched.push(String(order.assignedNurse));
  const coords = (order.location && order.location.coordinates) || {};
  const picks = await pickMatchNurses({ lat: coords.lat, lng: coords.lng, limit: MATCH_LIMIT_DEFAULT, excludeIds: everMatched });
  if (!picks.length) throw new ApiError(400, 'لا يوجد ممرضون إضافيون متاحون الآن — حاول بعد قليل');

  (order.matchedNurses || []).forEach((m) => {
    if (['pending', 'offered'].includes(m.status)) m.status = 'replaced';
  });
  picks.forEach((p) => order.matchedNurses.push({ nurse: p.nurse, distanceKm: p.distanceKm, status: 'pending', invitedAt: new Date() }));
  order.matchRound = (order.matchRound || 0) + 1;
  order.matchExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: `Patient refreshed matched nurses (round ${order.matchRound})` });
  await order.save();

  for (const p of picks) {
    await Notification.create({
      recipient: p.nurse, title: 'تم ترشيحك لطلب جديد ⭐',
      message: `اختارك النظام لطلب #${order.orderNumber}${p.distanceKm != null ? ` (على بعد ${p.distanceKm} كم)` : ''} — أرسل سعرك بسرعة`,
      type: 'order', data: { orderId: order._id, shortlisted: true, distanceKm: p.distanceKm }
    });
  }
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, matchesRefreshed: true, matchRound: order.matchRound });
    picks.forEach((p) => { try { emitToUser(String(p.nurse), 'notification', { title: 'تم ترشيحك لطلب جديد ⭐', orderId: order._id, shortlisted: true }); } catch (_) {} });
  } catch (_) {}
  ResponseHelper.success(res, { orderId: order._id, matchRound: order.matchRound, added: picks.length }, 'تم ترشيح ممرضين جدد — راجع القائمة');
});

// POST /api/orders/:id/choose {nurseId} (patient picks 1 of the matched nurses)
const chooseNurse = asyncHandler(async (req, res) => {
  const { nurseId } = req.body;
  if (!nurseId) throw new ApiError(400, 'nurseId is required');
  const order = await Order.findById(req.params.id).populate('service', 'nameAr');
  if (!order) throw new ApiError(404, 'Order not found');
  if (String(order.patient) !== String(req.user.id)) throw new ApiError(403, 'Not authorized');
  if (!['open', 'offers_received'].includes(order.status)) throw new ApiError(400, 'This request is no longer open for choosing');

  const matchedIds = (order.matchedNurses || []).map((m) => String(m.nurse));
  const nurseOffers = (order.offers || []).filter((o) => String(o.nurse) === String(nurseId));
  // Patient-first: any live price can be chosen — nothing waits for admin.
  const passed = nurseOffers.filter((o) => ['pending_review', 'pending_admin'].includes(o.status)).slice(-1)[0] || null;
  if (!matchedIds.includes(String(nurseId)) && !passed) throw new ApiError(404, 'This nurse is not among your matched nurses');

  const offerService = await Service.findById(order.service);
  assertAdminPriced(offerService);
  // inDrive rule: accept only same-or-higher than the fixed system price
  const { adminPriceOf } = require('../utils/adminPricing');
  const floor = adminPriceOf(offerService);
  const acceptedPrice = passed ? Number(passed.price) : Number(order.finalPrice);
  if (floor != null && acceptedPrice < floor) {
    throw new ApiError(400, `لا يمكن قبول ${acceptedPrice} ج.م — أقل من السعر الثابت (${floor} ج.م)`);
  }

  if (passed) {
    passed.status = 'approved';
    passed.reviewedAt = new Date();
    order.selectedOffer = passed._id;
  }
  // Upfront-bid settle: charge only the extra over what the patient already
  // secured (or refund the excess) — money moves straight to platform hold.
  const choosePatient = await User.findById(order.patient);
  const { settleAcceptPrice } = require('../utils/settlePrice');
  const settled = await settleAcceptPrice({ order, patient: choosePatient, acceptedPrice });
  order.assignedNurse = nurseId;
  order.status = 'assigned';
  order.acceptedAt = order.acceptedAt || new Date();
  order.nurseAccepted = null;
  order.nurseAcceptedAt = null;
  (order.matchedNurses || []).forEach((m) => {
    if (String(m.nurse) === String(nurseId)) m.status = 'chosen';
  });
  order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: passed ? `Patient chose nurse at price ${passed.price}` : 'Patient chose nurse at admin base price' });
  await order.save();

  try {
    const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
    await releaseEscrowToNurse(order);
  } catch (_) { /* best-effort */ }

  const priceShown = order.finalPrice;
  const settleNote = settled.diff > 0
    ? ` — تم خصم فرق السعر ${settled.diff} ج.م من محفظتك تلقائياً`
    : (settled.diff < 0 ? ` — تم إرجاع ${Math.abs(settled.diff)} ج.م لمحفظتك` : '');
  await Notification.create({ recipient: nurseId, title: 'تم اختيارك لطلب — أكّد القبول', message: `اختارك المريض لطلب #${order.orderNumber} بسعر ${priceShown} ج.م — افتح طلباتك واضغط "موافق" أو "رفض"`, type: 'order', data: { orderId: order._id } });
  const admins = await getAdminIds();
  for (const a of admins) {
    await Notification.create({ recipient: a._id, title: 'المريض اختار ممرضاً', message: `المريض اختار ممرضاً للطلب #${order.orderNumber} بسعر ${priceShown} ج.م${settled.diff !== 0 ? ` (تسوية المحفظة: ${settled.diff} ج.م)` : ''}`, type: 'order', data: { orderId: order._id, finalPrice: priceShown } });
  }
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'assigned', finalPrice: priceShown, nurseId: String(nurseId) });
    emitToUser(String(nurseId), 'notification', { title: 'تم اختيارك لطلب', orderId: order._id });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, status: 'assigned', finalPrice: priceShown, nurseId: String(nurseId), settledDiff: settled.diff }, settled.diff > 0 ? `تم الاختيار — خُصم فرق السعر ${settled.diff} ج.م من محفظتك` : 'تم اختيار الممرض — بانتظار تأكيده');
});

// POST /api/orders/:id/reject-offer {offerId} (patient rejects one nurse price)
// inDrive right: patient can accept OR reject each suggested price. The nurse
// is notified and may send a new price; the request stays open for the rest.
const rejectOffer = asyncHandler(async (req, res) => {
  const { offerId } = req.body;
  if (!offerId) throw new ApiError(400, 'offerId is required');
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found');
  if (String(order.patient) !== String(req.user.id)) throw new ApiError(403, 'Not authorized');
  if (!['open', 'offers_received'].includes(order.status)) throw new ApiError(400, 'This request is no longer open');
  const offer = order.offers.id(offerId);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (!['pending_review', 'pending_admin'].includes(offer.status)) throw new ApiError(400, 'Offer is not available');
  offer.status = 'rejected';
  offer.reviewedAt = new Date();
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: `Patient rejected price ${offer.price}` });
  await order.save();
  await Notification.create({ recipient: offer.nurse, title: 'المريض رفض سعرك', message: `رفض المريض سعرك ${offer.price} ج.م للطلب #${order.orderNumber} — يمكنك إرسال سعر جديد`, type: 'order', data: { orderId: order._id } });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, offerRejected: String(offer._id) });
    emitToUser(String(offer.nurse), 'notification', { title: 'المريض رفض سعرك', orderId: order._id });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, offerId, status: 'rejected' }, 'تم رفض السعر — يمكنك اختيار ممرض آخر');
});

module.exports = { createSimple, acceptOrder, startService, arriveOrder, submitVisitReport, requestCall, callQuota, confirmOrder, cancelOrder, getOrderCompat, rateOrder, approveOffer, payManual, submitOffer, acceptSuggestedPrice, respondToAssignment, completeCash, getMatches, refreshMatches, chooseNurse, rejectOffer };
