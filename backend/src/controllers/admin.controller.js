const User = require('../models/User');
const Order = require('../models/Order');
const VerificationLog = require('../models/VerificationLog');
const Notification = require('../models/Notification');
const Wallet = require('../models/Wallet');
const Service = require('../models/Service');
const ApiError = require('../utils/ApiError');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { deleteFromCloudinary } = require('../config/cloudinary');
const { sendPasswordResetEmail } = require('../utils/email');
const crypto = require('crypto');
const fs = require('fs');

// Calculate platform earnings across all completed orders
const calculatePlatformEarnings = async () => {
  const [totalFees, totalNurseEarnings, totalRevenue, totalWithdrawals, pendingWithdrawals] = await Promise.all([
    Wallet.aggregate([{ $match: { type: 'fee', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Wallet.aggregate([{ $match: { type: 'earning', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Wallet.aggregate([{ $match: { type: 'payment', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Wallet.aggregate([{ $match: { type: 'withdrawal', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Wallet.aggregate([{ $match: { type: 'withdrawal', status: 'pending' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
  ]);
  return {
    totalRevenue: totalRevenue[0]?.total || 0,
    totalPlatformFees: totalFees[0]?.total || 0,
    totalNurseEarnings: totalNurseEarnings[0]?.total || 0,
    totalWithdrawalsPaid: totalWithdrawals[0]?.total || 0,
    pendingWithdrawals: pendingWithdrawals[0]?.total || 0
  };
};

// Admin earnings statistics: platform fees, commissions, withdrawals, balance
const getAdminEarnings = asyncHandler(async (req, res) => {
  const earnings = await calculatePlatformEarnings();
  const [topupsPending] = await Promise.all([
    Wallet.find({ type: 'deposit', status: 'pending' }).countDocuments()
  ]);
  const stats = await calculatePlatformEarnings();
  ResponseHelper.success(res, {
    earnings: stats,
    topupsPending,
    timestamp: new Date().toISOString()
  }, 'Platform earnings statistics');
});

const getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalUsers, totalPatients, totalNurses, pendingVerifications,
    totalOrders, pendingOrders, underReviewOrders, completedOrders, revenueAgg,
    earnings
  ] = await Promise.all([
    User.countDocuments({ role: { $in: ['patient', 'nurse'] } }),
    User.countDocuments({ role: 'patient' }),
    User.countDocuments({ role: 'nurse' }),
    User.countDocuments({ role: 'nurse', status: 'pending' }),
    Order.countDocuments(),
    Order.countDocuments({ status: { $in: ['open', 'offers_received'] } }),
    Order.countDocuments({ status: 'under_review' }),
    Order.countDocuments({ status: 'completed' }),
    Order.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$finalPrice' } } }]),
    calculatePlatformEarnings()
  ]);

  ResponseHelper.success(res, {
    stats: { totalUsers, totalPatients, totalNurses, pendingVerifications, totalOrders, pendingOrders, underReviewOrders, completedOrders, totalRevenue: (revenueAgg[0] && revenueAgg[0].total) || 0 },
    earnings
  }, 'تم جلب الإحصائيات');
});

const getPendingVerifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [nurses, total] = await Promise.all([
    User.find({ role: 'nurse', status: 'pending' }).select('-password').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    User.countDocuments({ role: 'nurse', status: 'pending' })
  ]);

  ResponseHelper.paginated(res, nurses, { page: parseInt(page), limit: parseInt(limit), total }, 'قائمة الممرضين بانتظار التوثيق');
});

const getNurseVerificationDetails = asyncHandler(async (req, res) => {
  const { nurseId } = req.params;
  const nurse = await User.findOne({ _id: nurseId, role: 'nurse' }).select('-password');
  if (!nurse) throw new ApiError(404, 'الممرض غير موجود');

  const logs = await VerificationLog.find({ nurse: nurseId }).populate('performedBy', 'fullName').sort({ createdAt: -1 });
  ResponseHelper.success(res, { nurse, verificationHistory: logs }, 'تفاصيل التوثيق');
});

const verifyNurse = asyncHandler(async (req, res) => {
  // Compat: docId may be "nurseId" or "nurseId:kind" (verification.html sends "nurseId:idCard")
  const nurseId = String(req.params.nurseId).split(':')[0];
  const raw = req.body.action || req.body.status;
  const action = (raw === 'approve' || raw === 'approved') ? 'approve' : 'reject';
  const { notes } = req.body;

  const nurse = await User.findOne({ _id: nurseId, role: 'nurse' });
  if (!nurse) throw new ApiError(404, 'الممرض غير موجود');
  if (nurse.status !== 'pending') throw new ApiError(400, 'هذا الحساب تمت مراجعته مسبقاً');

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  nurse.status = newStatus;
  await nurse.save();

  await VerificationLog.create({
    nurse: nurseId, action: action === 'approve' ? 'approved' : 'rejected', performedBy: req.user.id, notes: notes || null,
    idCardImageUrl: nurse.idCardImage?.url, licenseImageUrl: nurse.licenseImage?.url
  });

  await Notification.create({
    recipient: nurseId,
    title: action === 'approve' ? 'تم قبول حسابك' : 'تم رفض حسابك',
    message: action === 'approve' ? 'تهانينا! تم قبول حسابك.' : `تم رفض طلب التسجيل. ${notes ? 'السبب: ' + notes : ''}`,
    type: 'verification'
  });

  ResponseHelper.success(res, { nurseId, status: newStatus, action }, action === 'approve' ? 'تم قبول الممرض' : 'تم رفض الممرض');
  try { require('../utils/audit').logAdmin(req, 'nurse.verify', { targetType: 'nurse', targetId: String(nurseId), details: `${nurse.fullName} (${nurse.email}) -> ${newStatus}${notes ? ' | ' + String(notes).slice(0, 200) : ''}` }); } catch (_) {}
});

// --- Legacy-frontend compat (admin/*.html shapes) ---

// GET /admin/verifications -> flat document list for verification.html
const getVerificationsCompat = asyncHandler(async (req, res) => {
  const nurses = await User.find({ role: 'nurse', status: 'pending' }).select('-password').sort({ createdAt: -1 }).limit(50);
  const docs = [];
  for (const n of nurses) {
    docs.push({
      id: `${n._id}:idCard`,
      type: 'national_id',
      fileUrl: n.idCardImage?.url || null,
      documentNumber: n.nationalId,
      createdAt: n.createdAt,
      user: { id: n._id, name: n.fullName, email: n.email, phone: n.phone, specialization: n.specialization }
    });
    docs.push({
      id: `${n._id}:license`,
      type: 'nursing_license',
      fileUrl: n.licenseImage?.url || null,
      documentNumber: n.nationalId,
      createdAt: n.createdAt,
      user: { id: n._id, name: n.fullName, email: n.email, phone: n.phone, specialization: n.specialization }
    });
  }
  ResponseHelper.success(res, docs, 'طلبات التوثيق');
});

// GET /admin/payments -> { stats, transactions } for payments.html
const getPaymentsStats = asyncHandler(async (req, res) => {
  const txs = await Wallet.find({ status: 'completed' }).sort({ createdAt: -1 }).limit(50);
  const sum = (type) => txs.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  ResponseHelper.success(res, {
    stats: {
      totalDeposits: sum('deposit'),
      totalPayments: sum('payment'),
      totalEarnings: sum('earning'),
      totalFees: sum('fee')
    },
    transactions: txs.map((t) => ({
      id: t._id,
      type: t.type,
      amount: t.amount,
      status: t.status,
      paymentMethod: t.paymentMethod,
      description: t.description,
      createdAt: t.createdAt
    }))
  }, 'المدفوعات');
});

// PUT /admin/users/:userId -> generic update for users.html toggle
const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  if (user.role === 'admin') throw new ApiError(403, 'لا يمكن تعديل حساب أدمن');

  const allowed = ['fullName', 'phone', 'isActive', 'status', 'specialization', 'yearsOfExperience', 'bio'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) user[key] = req.body[key];
  }
  await user.save();
  ResponseHelper.success(res, { userId, isActive: user.isActive, status: user.status }, 'تم تحديث المستخدم');
});

const getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, role, status, search } = req.query;
  const query = { role: { $in: ['patient', 'nurse'] } };
  if (role) query.role = role;
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [users, total] = await Promise.all([
    User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    User.countDocuments(query)
  ]);

  // Legacy aliases for users.html (id / name / isVerified)
  const mapped = users.map((u) => ({
    ...u,
    id: String(u._id),
    name: u.fullName,
    isVerified: u.status === 'approved' || u.status === 'active'
  }));

  ResponseHelper.paginated(res, mapped, { page: parseInt(page), limit: parseInt(limit), total }, 'قائمة المستخدمين');
});

// POST /admin/users -> admin creates a patient/nurse account (add privilege)
const createUser = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password, nationalId, role, gender, specialization, yearsOfExperience } = req.body;

  if (!fullName || !email || !phone || !password || !nationalId || !role) {
    throw new ApiError(400, 'جميع الحقول مطلوبة: الاسم، البريد، الهاتف، كلمة المرور، الرقم القومي، الدور');
  }
  if (role === 'admin') throw new ApiError(403, 'لا يمكن إنشاء حساب أدمن من هنا');
  if (!['patient', 'nurse'].includes(role)) throw new ApiError(400, 'الدور يجب أن يكون مريض أو ممرض');

  const existingUser = await User.findOne({ $or: [{ email }, { phone }, { nationalId }] });
  if (existingUser) {
    if (existingUser.email === email) throw new ApiError(409, 'البريد الإلكتروني مسجل مسبقاً');
    if (existingUser.phone === phone) throw new ApiError(409, 'رقم الهاتف مسجل مسبقاً');
    if (existingUser.nationalId === nationalId) throw new ApiError(409, 'الرقم القومي مسجل مسبقاً');
  }

  const user = await User.create({
    fullName,
    email,
    phone,
    password,
    nationalId,
    role,
    gender: gender || null,
    status: role === 'nurse' ? 'pending' : 'active',
    isActive: true,
    specialization: specialization || null,
    yearsOfExperience: yearsOfExperience || 0,
  });

  ResponseHelper.success(res, {
    user: { id: user._id, fullName: user.fullName, email: user.email, phone: user.phone, role: user.role, status: user.status }
  }, 'تم إنشاء المستخدم بنجاح', 201);
});

const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId).select('-password');
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  ResponseHelper.success(res, { user }, 'بيانات المستخدم');
});

const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  if (user.role === 'admin') throw new ApiError(403, 'لا يمكن حذف حساب أدمن');

  if (user.idCardImage?.publicId) await deleteFromCloudinary(user.idCardImage.publicId).catch(() => {});
  if (user.licenseImage?.publicId) await deleteFromCloudinary(user.licenseImage.publicId).catch(() => {});

  await User.findByIdAndDelete(userId);
  try { require('../utils/audit').logAdmin(req, 'user.delete', { targetType: 'user', targetId: String(userId), details: `${user.fullName} (${user.email}, ${user.role})` }); } catch (_) {}
  ResponseHelper.success(res, { userId }, 'تم حذف المستخدم بنجاح');
});

const resetUserPassword = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');

  const passwordToSet = newPassword || (crypto.randomBytes(4).toString('hex') + 'Qrb@' + Math.floor(Math.random() * 100));
  user.password = passwordToSet;
  await user.save();

  try { await sendPasswordResetEmail(user.email, passwordToSet); } catch (e) { console.log('Email failed:', e.message); }

  ResponseHelper.success(res, { userId, email: user.email }, 'تم إعادة تعيين كلمة المرور');
});

const toggleUserStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  if (user.role === 'admin') throw new ApiError(403, 'لا يمكن تعديل حالة أدمن');

  user.isActive = !user.isActive;
  await user.save();
  try { require('../utils/audit').logAdmin(req, 'user.toggle', { targetType: 'user', targetId: String(userId), details: `${user.fullName} (${user.email}) -> isActive=${user.isActive}` }); } catch (_) {}

  await Notification.create({
    recipient: user._id,
    title: user.isActive ? 'تم تفعيل حسابك' : 'تم تعطيل حسابك',
    message: user.isActive ? 'أعادت الإدارة تفعيل حسابك — يمكنك العمل الآن' : 'عطّلت الإدارة حسابك — تواصل مع الدعم',
    type: 'system'
  });
  try {
    const { emitToUser } = require('../sockets');
    emitToUser(String(user._id), 'notification', { title: user.isActive ? 'تم تفعيل حسابك' : 'تم تعطيل حسابك' });
  } catch (_) { /* sockets optional */ }

  ResponseHelper.success(res, { userId, isActive: user.isActive }, user.isActive ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب');
});

const getAllOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const query = {};
  if (status) query.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [orders, total] = await Promise.all([
    Order.find(query).populate('patient', 'fullName phone').populate('service', 'nameAr basePrice').populate('assignedNurse', 'fullName phone').populate('offers.nurse', 'fullName phone rating').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Order.countDocuments(query)
  ]);

  // Legacy aliases for orders.html (id / serviceType / patient.name / nurse.name / amount)
  const mapped = orders.map((o) => ({
    ...o,
    id: String(o._id),
    serviceType: o.service?.nameAr || 'تمريض منزلي',
    patient: o.patient ? { ...o.patient, id: String(o.patient._id), name: o.patient.fullName } : null,
    nurse: o.assignedNurse ? { ...o.assignedNurse, id: String(o.assignedNurse._id), name: o.assignedNurse.fullName } : null,
    amount: o.finalPrice ?? o.service?.basePrice ?? 0,
    offers: (o.offers || []).map((of) => ({
      id: String(of._id), price: of.price, status: of.status, notes: of.notes || null,
      createdAt: of.createdAt || null,
      nurse: of.nurse ? { id: String(of.nurse._id || of.nurse), name: of.nurse.fullName || null, phone: of.nurse.phone || null, rating: of.nurse.rating ?? null } : null
    }))
  }));

  ResponseHelper.paginated(res, mapped, { page: parseInt(page), limit: parseInt(limit), total }, 'قائمة الطلبات');
});

const getOrderDetails = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId)
    .populate('patient', 'fullName phone email location')
    .populate('service', 'nameAr description basePrice')
    .populate('assignedNurse', 'fullName phone')
    .populate('offers.nurse', 'fullName phone rating yearsOfExperience')
    .populate('offers.reviewedBy', 'fullName');

  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  ResponseHelper.success(res, { order }, 'تفاصيل الطلب');
});

const reviewOrderPrice = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { action, adminNotes } = req.body;

  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  if (order.status !== 'under_review') throw new ApiError(400, 'الطلب ليس في حالة المراجعة');

  if (action === 'approve') {
    const pendingOffer = order.offers.find(o => o.status === 'pending_review');
    if (!pendingOffer) throw new ApiError(400, 'لا يوجد عرض قيد المراجعة');

    pendingOffer.status = 'approved';
    pendingOffer.reviewedBy = req.user.id;
    pendingOffer.reviewedAt = new Date();
    pendingOffer.adminNotes = adminNotes || null;

    order.selectedOffer = pendingOffer._id;
    order.finalPrice = pendingOffer.price;
    order.commission = Math.round(pendingOffer.price * (order.commissionRate / 100));
    order.status = 'price_approved';
    order.statusHistory.push({ status: 'price_approved', changedBy: req.user.id, notes: adminNotes || 'تمت الموافقة على السعر' });
    await order.save();

    await Notification.create({ recipient: order.patient, title: 'تمت الموافقة على السعر', message: `تمت مراجعة سعر طلبك #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
    await Notification.create({ recipient: pendingOffer.nurse, title: 'تمت الموافقة على عرضك', message: `تمت الموافقة على عرضك للطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });

    ResponseHelper.success(res, { orderId, status: 'price_approved', finalPrice: order.finalPrice, commission: order.commission }, 'تمت الموافقة على السعر');
  } else {
    const pendingOffer = order.offers.find(o => o.status === 'pending_review');
    if (pendingOffer) {
      pendingOffer.status = 'rejected';
      pendingOffer.reviewedBy = req.user.id;
      pendingOffer.reviewedAt = new Date();
      pendingOffer.adminNotes = adminNotes || null;
    }
    order.status = 'open';
    order.statusHistory.push({ status: 'open', changedBy: req.user.id, notes: adminNotes || 'تم رفض السعر' });
    await order.save();

    if (pendingOffer) {
      await Notification.create({ recipient: pendingOffer.nurse, title: 'تم رفض عرضك', message: `تم رفض عرضك للطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
    }
    ResponseHelper.success(res, { orderId, status: 'open' }, 'تم رفض السعر');
  }
});

// POST /admin/orders/:orderId/set-price {price, notes?}
// Admin prices a patient request (usually under_review): sets finalPrice and
// opens it to nurses (nearest first). This is the required step before any
// nurse can accept the order.
const setOrderPrice = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const price = Number(req.body.price);
  const notes = req.body.notes || null;
  if (!Number.isFinite(price) || price <= 0) throw new ApiError(400, 'السعر يجب أن يكون أكبر من صفر');

  const order = await Order.findById(orderId).populate('service', 'nameAr basePrice');
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  if (!['under_review', 'open'].includes(order.status)) {
    throw new ApiError(400, 'لا يمكن تسعير هذا الطلب في حالته الحالية');
  }

  const rate = Number(order.commissionRate) > 0 ? Number(order.commissionRate) : 10;
  order.finalPrice = price;
  order.commission = Math.round(price * (rate / 100) * 100) / 100;
  order.nurseEarnings = Math.round((price - order.commission) * 100) / 100;
  order.platformFee = order.commission;
  order.status = 'open';
  order.statusHistory.push({ status: 'open', changedBy: req.user.id, notes: notes || `Admin set price ${price}` });
  await order.save();

  await Notification.create({
    recipient: order.patient, title: 'تم تحديد سعر طلبك 💰',
    message: `حددت الإدارة سعر طلبك #${order.orderNumber}: ${price} ج.م — ظهر الآن لأقرب الممرضين`,
    type: 'order', data: { orderId: order._id, finalPrice: price }
  });

  const { notifyNewOrder } = require('../utils/notifyOrder');
  const gov = (order.location && order.location.governorate) || 'Cairo';
  const { nurses } = await notifyNewOrder({ order, serviceDoc: order.service, gov, amount: price, skipAdmins: true });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'open', finalPrice: price });
    nurses.forEach((n) => emitToUser(String(n._id), 'notification', { title: 'طلب جديد متاح', orderId: order._id }));
  } catch (_) { /* sockets optional */ }

  ResponseHelper.success(res, { orderId, status: 'open', finalPrice: price }, 'تم تحديد السعر وإتاحة الطلب للممرضين');
});

// POST /admin/orders/:orderId/approve-service
// Approves the service so the request becomes visible to nurses (nearest first).
// Requires a price (catalog price or a manually set one).
const approveService = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId).populate('service', 'nameAr basePrice');
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  if (order.status !== 'under_review') throw new ApiError(400, 'الطلب ليس بانتظار الاعتماد');
  const price = Number(order.finalPrice ?? order.service?.basePrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new ApiError(400, 'حدد السعر أولاً قبل اعتماد الخدمة');
  }
  const rate = Number(order.commissionRate) > 0 ? Number(order.commissionRate) : 10;
  order.finalPrice = price;
  order.commission = Math.round(price * (rate / 100) * 100) / 100;
  order.nurseEarnings = Math.round((price - order.commission) * 100) / 100;
  order.platformFee = order.commission;
  order.status = 'open';
  order.statusHistory.push({ status: 'open', changedBy: req.user.id, notes: `Admin approved service at ${price}` });
  await order.save();

  await Notification.create({
    recipient: order.patient, title: 'الإدارة اعتمدت طلبك',
    message: `اعتمدت الإدارة طلبك #${order.orderNumber} بسعر ${price} ج.م — ظهر الآن لأقرب الممرضين`,
    type: 'order', data: { orderId: order._id, finalPrice: price }
  });
  const { notifyNewOrder } = require('../utils/notifyOrder');
  const gov = (order.location && order.location.governorate) || 'Cairo';
  const { nurses } = await notifyNewOrder({ order, serviceDoc: order.service, gov, amount: price, skipAdmins: true });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'open', finalPrice: price });
    nurses.forEach((n) => emitToUser(String(n._id), 'notification', { title: 'طلب جديد متاح', orderId: order._id }));
  } catch (_) { /* sockets optional */ }

  ResponseHelper.success(res, { orderId, status: 'open', finalPrice: price }, 'تم اعتماد الخدمة وإتاحة الطلب للممرضين');
});

// POST /admin/orders/:orderId/suggest-price {price}
// Admin suggests a price: patient must accept it before the request opens to nurses.
const suggestOrderPrice = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const price = Number(req.body.price);
  if (!Number.isFinite(price) || price <= 0) throw new ApiError(400, 'السعر يجب أن يكون أكبر من صفر');
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  if (!['under_review', 'open'].includes(order.status)) {
    throw new ApiError(400, 'لا يمكن اقتراح سعر في الحالة الحالية');
  }
  const rate = Number(order.commissionRate) > 0 ? Number(order.commissionRate) : 10;
  order.finalPrice = price;
  order.commission = Math.round(price * (rate / 100) * 100) / 100;
  order.nurseEarnings = Math.round((price - order.commission) * 100) / 100;
  order.platformFee = order.commission;
  order.status = 'price_approved';
  order.statusHistory.push({ status: 'price_approved', changedBy: req.user.id, notes: `Admin suggested price ${price} — waiting for patient` });
  await order.save();

  await Notification.create({
    recipient: order.patient, title: 'الإدارة اقترحت سعراً',
    message: `اقترحت الإدارة ${price} ج.م لطلبك #${order.orderNumber} — اقبل السعر ليظهر طلبك للممرضين`,
    type: 'order', data: { orderId: order._id, finalPrice: price }
  });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'price_approved', finalPrice: price });
    emitToUser(String(order.patient), 'notification', { title: 'الإدارة اقترحت سعراً', orderId: order._id, finalPrice: price });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId, status: 'price_approved', finalPrice: price }, 'تم إرسال السعر المقترح للمريض');
});

// GET /admin/feedbacks — patient ratings with comments for the admin panel
const getFeedbacks = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, minRating } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const query = { 'patientReview.rating': { $ne: null } };
  if (minRating != null && minRating !== '') query['patientReview.rating'] = { $gte: Number(minRating) };
  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate('patient', 'fullName phone')
      .populate('assignedNurse', 'fullName phone')
      .populate('service', 'nameAr')
      .sort({ updatedAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Order.countDocuments(query)
  ]);
  ResponseHelper.paginated(res, orders.map((o) => ({
    id: String(o._id), orderNumber: o.orderNumber, status: o.status,
    service: o.service?.nameAr || null,
    patient: o.patient ? { id: String(o.patient._id), name: o.patient.fullName, phone: o.patient.phone } : null,
    nurse: o.assignedNurse ? { id: String(o.assignedNurse._id), name: o.assignedNurse.fullName, phone: o.assignedNurse.phone } : null,
    rating: o.patientReview?.rating ?? null,
    comment: o.patientReview?.comment || null,
    createdAt: o.patientReview?.createdAt || o.updatedAt,
    finalPrice: o.finalPrice ?? null,
    nurseArrived: !!o.nurseArrived,
    arrivedAt: o.arrivedAt || null,
    visitReport: o.visitReport?.summary ? { summary: o.visitReport.summary, createdAt: o.visitReport.createdAt || null } : null
  })), { page: parseInt(page), limit: parseInt(limit), total }, 'تقييمات المرضى');
});

// GET /admin/nurse-reports — per-nurse performance report
const getNurseReports = asyncHandler(async (req, res) => {
  const nurses = await User.find({ role: 'nurse' }).select('fullName phone specialization rating totalReviews isOnline status walletBalance createdAt').lean();
  const reports = await Promise.all(nurses.map(async (n) => {
    const [assigned, completed, cancelled, inProgress] = await Promise.all([
      Order.countDocuments({ assignedNurse: n._id }),
      Order.countDocuments({ assignedNurse: n._id, status: 'completed' }),
      Order.countDocuments({ assignedNurse: n._id, status: { $in: ['cancelled', 'refunded'] } }),
      Order.countDocuments({ assignedNurse: n._id, status: { $in: ['assigned', 'in_progress'] } })
    ]);
    const [earnAgg, wdPaidAgg, wdPendAgg] = await Promise.all([
      Wallet.aggregate([{ $match: { user: n._id, type: 'earning', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Wallet.aggregate([{ $match: { user: n._id, type: 'withdrawal', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Wallet.aggregate([{ $match: { user: n._id, type: 'withdrawal', status: 'pending' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);
    const done = completed + cancelled;
    return {
      id: String(n._id), name: n.fullName, phone: n.phone,
      specialization: n.specialization || null,
      rating: n.rating ?? 0, totalReviews: n.totalReviews || 0,
      isOnline: !!n.isOnline, status: n.status,
      walletBalance: n.walletBalance || 0,
      ordersAssigned: assigned, ordersCompleted: completed,
      ordersCancelled: cancelled, ordersActive: inProgress,
      completionRate: done ? Math.round((completed / done) * 100) : null,
      totalEarnings: earnAgg[0]?.total || 0,
      withdrawalsPaid: wdPaidAgg[0]?.total || 0,
      withdrawalsPending: wdPendAgg[0]?.total || 0,
      memberSince: n.createdAt
    };
  }));
  reports.sort((a, b) => b.ordersCompleted - a.ordersCompleted);
  ResponseHelper.success(res, reports, 'تقارير الممرضين');
});

// PATCH /admin/services/:serviceId {requireApproval?, isActive?, basePrice?}
const updateService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.serviceId);
  if (!service) throw new ApiError(404, 'Service not found');
  if (req.body.requireApproval !== undefined) service.requireApproval = !!req.body.requireApproval;
  if (req.body.isActive !== undefined) service.isActive = !!req.body.isActive;
  if (req.body.basePrice !== undefined) {
    const p = Number(req.body.basePrice);
    if (!Number.isFinite(p) || p < 0) throw new ApiError(400, 'Invalid basePrice');
    service.basePrice = p;
  }
  await service.save();
  ResponseHelper.success(res, { service }, 'Service updated');
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status, notes } = req.body;

  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');

  order.status = status;
  order.statusHistory.push({ status, changedBy: req.user.id, notes: notes || null });
  if (status === 'completed') order.completedAt = new Date();
  await order.save();

  // Every admin status change alerts the parties on their panels
  await Notification.create({ recipient: order.patient, title: 'تحديث على طلبك', message: `غيّرت الإدارة حالة الطلب #${order.orderNumber} إلى "${status}"`, type: 'order', data: { orderId: order._id, status } });
  if (order.assignedNurse) {
    await Notification.create({ recipient: order.assignedNurse, title: 'تحديث على طلبك', message: `غيّرت الإدارة حالة الطلب #${order.orderNumber} إلى "${status}"`, type: 'order', data: { orderId: order._id, status } });
  }
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status });
    emitToUser(String(order.patient), 'notification', { title: 'تحديث على طلبك', orderId: order._id });
    if (order.assignedNurse) emitToUser(String(order.assignedNurse), 'notification', { title: 'تحديث على طلبك', orderId: order._id });
  } catch (_) { /* sockets optional */ }

  ResponseHelper.success(res, { orderId, status }, 'تم تحديث حالة الطلب');
});

// DELETE /admin/orders/:orderId — admin removes a service entirely (any state).
// Held escrow is refunded to the patient wallet first. Patient + nurse are
// notified with a bell alert, chats of the order are cleaned up.
const deleteOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');

  if (order.escrowStatus === 'held') {
    const patient = await User.findById(order.patient);
    if (patient) {
      const refundAmount = order.finalPrice || 0;
      patient.walletBalance = (patient.walletBalance || 0) + refundAmount;
      await patient.save();
      await Wallet.create({
        user: patient._id, order: order._id, type: 'refund',
        amount: refundAmount, status: 'completed',
        description: `Refund for admin-removed order ${order.orderNumber}`,
        balanceAfter: patient.walletBalance
      });
    }
  }

  const targets = [];
  if (order.patient) targets.push({ id: order.patient, msg: `أزالت الإدارة طلبك #${order.orderNumber} نهائياً` });
  if (order.assignedNurse) targets.push({ id: order.assignedNurse, msg: `أزالت الإدارة الطلب #${order.orderNumber} نهائياً` });
  for (const t of targets) {
    try {
      await Notification.create({ recipient: t.id, title: 'تمت إزالة الطلب', message: t.msg, type: 'order', data: { orderId: order._id } });
    } catch (_) {}
  }
  try {
    const Chat = require('../models/Chat');
    await Chat.deleteMany({ order: order._id });
  } catch (_) {}
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'removed' });
    targets.forEach((t) => emitToUser(String(t.id), 'notification', { title: 'تمت إزالة الطلب', orderId: order._id }));
  } catch (_) {}

  await Order.findByIdAndDelete(orderId);
  ResponseHelper.success(res, { orderId }, 'تمت إزالة الطلب نهائياً مع رد المبلغ المحجوز');
});

// Wallet top-up review: patient sends InstaPay to owner, admin confirms receipt
const getPendingTopups = asyncHandler(async (req, res) => {
  const txs = await Wallet.find({ type: 'deposit', status: 'pending' })
    .populate('user', 'fullName email phone')
    .sort({ createdAt: -1 })
    .limit(50);
  ResponseHelper.success(res, txs.map((t) => ({
    id: String(t._id),
    amount: t.amount,
    reference: t.reference,
    description: t.description,
    createdAt: t.createdAt,
    user: t.user ? { id: String(t.user._id), name: t.user.fullName, email: t.user.email, phone: t.user.phone } : null
  })), 'طلبات الشحن المعلقة');
});

const reviewTopup = asyncHandler(async (req, res) => {
  const { topupId } = req.params;
  const raw = req.body.action || req.body.status;
  const approve = (raw === 'approve' || raw === 'approved');
  const tx = await Wallet.findOne({ _id: topupId, type: 'deposit', status: 'pending' });
  if (!tx) throw new ApiError(404, 'Top-up request not found');

  if (approve) {
    const user = await User.findById(tx.user);
    user.walletBalance = (user.walletBalance || 0) + tx.amount;
    await user.save();
    tx.status = 'completed';
    tx.balanceAfter = user.walletBalance;
    await tx.save();
    await Notification.create({ recipient: user._id, title: 'تم شحن محفظتك', message: `تمت إضافة ${tx.amount} ج.م إلى محفظتك`, type: 'payment' });
  } else {
    tx.status = 'failed';
    await tx.save();
  }
  ResponseHelper.success(res, { topupId, status: tx.status }, approve ? 'تم تأكيد الشحن' : 'تم رفض الشحن');
});

// Manual order payments (InstaPay / Vodafone Cash to owner): patient sends
// the transfer, NOTHING is credited until the admin accepts it here.
const getPendingOrderPayments = asyncHandler(async (req, res) => {
  const txs = await Wallet.find({ type: 'payment', status: 'pending' })
    .populate('user', 'fullName email phone')
    .populate('order', 'orderNumber finalPrice status')
    .sort({ createdAt: -1 })
    .limit(50);
  ResponseHelper.success(res, txs.map((t) => ({
    id: String(t._id),
    amount: t.amount,
    paymentMethod: t.paymentMethod,
    reference: t.reference,
    description: t.description,
    createdAt: t.createdAt,
    order: t.order ? { id: String(t.order._id), orderNumber: t.order.orderNumber, finalPrice: t.order.finalPrice, status: t.order.status } : null,
    user: t.user ? { id: String(t.user._id), name: t.user.fullName, email: t.user.email, phone: t.user.phone } : null
  })), 'تحويلات الطلبات المعلقة');
});

const reviewOrderPayment = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const raw = req.body.action || req.body.status;
  const approve = (raw === 'approve' || raw === 'approved');
  const tx = await Wallet.findOne({ _id: paymentId, type: 'payment', status: 'pending' });
  if (!tx) throw new ApiError(404, 'Order payment not found');
  const order = await Order.findById(tx.order);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');

  if (approve) {
    tx.status = 'completed';
    await tx.save();
    order.paymentStatus = 'paid';
    order.paymentMethod = tx.paymentMethod;
    order.escrowStatus = 'held';
    order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: `Admin accepted manual transfer (${tx.paymentMethod}) — escrow held` });
    await order.save();

    const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
    const released = await releaseEscrowToNurse(order);

    await Notification.create({ recipient: order.patient, title: 'الإدارة قبلت تحويلك ✅', message: `قبلت الإدارة تحويلك ${tx.amount} ج.م للطلب #${order.orderNumber} — تم تفعيل الطلب`, type: 'order', data: { orderId: order._id } });
    if (order.assignedNurse && !released.released) {
      await Notification.create({ recipient: order.assignedNurse, title: 'تم الدفع', message: `تم دفع طلبك #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
    }
    try {
      const { emitToOrder, emitToUser } = require('../sockets');
      emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, paymentStatus: 'paid' });
      emitToUser(String(order.patient), 'notification', { title: 'الإدارة قبلت تحويلك ✅', orderId: order._id });
    } catch (_) {}
    try { require('../utils/audit').logAdmin(req, 'order.price', { targetType: 'order', targetId: String(order._id), details: `accepted ${tx.amount} EGP via ${tx.paymentMethod} (ref ${tx.reference || '—'})` }); } catch (_) {}
    ResponseHelper.success(res, { paymentId, status: tx.status, paidToNurse: released.earning || 0 }, released.released ? 'تم القبول وتحويل المبلغ لرصيد الممرض' : 'تم القبول وتفعيل الطلب');
  } else {
    tx.status = 'failed';
    await tx.save();
    await Notification.create({ recipient: order.patient, title: 'تم رفض التحويل ❌', message: `رفضت الإدارة تحويلك ${tx.amount} ج.م للطلب #${order.orderNumber} — تحقق من المرجع وحاول مجدداً`, type: 'order', data: { orderId: order._id } });
    try { require('../utils/audit').logAdmin(req, 'order.price', { targetType: 'order', targetId: String(order._id), details: `rejected ${tx.amount} EGP via ${tx.paymentMethod}` }); } catch (_) {}
    ResponseHelper.success(res, { paymentId, status: tx.status }, 'تم رفض التحويل وإشعار المريض');
  }
});

// Admin approves completion: closes the order. With direct pay the money
// already went to the nurse on payment/assignment — this only pays out
// when an escrow is still held (never double-pays).
const completeOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
    throw new ApiError(400, 'Order is already closed');
  }
  if (!order.assignedNurse) throw new ApiError(400, 'No nurse assigned to this order');
  if (order.escrowStatus === 'cancelled') throw new ApiError(400, 'This order was cancelled');

  let paidToNurse = 0;
  if (order.escrowStatus === 'held') {
    const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
    const r = await releaseEscrowToNurse(order);
    paidToNurse = r.earning || 0;
  }

  const nurse = await User.findById(order.assignedNurse);
  order.status = 'completed';
  order.completedAt = new Date();
  order.escrowStatus = 'released';
  order.paymentStatus = 'paid';
  order.statusHistory.push({ status: 'completed', changedBy: req.user.id, notes: paidToNurse > 0 ? 'Admin approved completion — paid to nurse' : 'Admin approved completion (already paid directly)' });
  await order.save();

  // REAL plan perk: Pro 5% / VIP 10% visit cashback to the patient wallet
  try { await require('./subscription.controller').grantVisitCashback(order); } catch (_) {}

  await Notification.create({ recipient: order.patient, title: 'تم إنجاز طلبك', message: `تمت الموافقة على إنجاز طلبك #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  if (paidToNurse <= 0) {
    await Notification.create({ recipient: nurse._id, title: 'تم إنجاز طلبك', message: `اعتمدت الإدارة إنجاز الطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  }

  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'completed' });
    emitToUser(String(order.patient), 'notification', { title: 'تم إنجاز طلبك', orderId: order._id });
  } catch (_) { /* sockets optional */ }

  ResponseHelper.success(res, { orderId: order._id, status: 'completed', paidToNurse }, paidToNurse > 0 ? 'تمت الموافقة وتحويل المبلغ للممرض' : 'تم اعتماد الإنجاز (المبلغ محوّل مسبقاً)');
});

// Nurse withdrawals: list pending (with nurse payout account) + approve/reject
const getPendingWithdrawals = asyncHandler(async (req, res) => {
  const txs = await Wallet.find({ type: 'withdrawal', status: 'pending' })
    .populate('user', 'fullName email phone payoutMethod payoutAccount walletBalance subscription')
    .sort({ createdAt: -1 })
    .limit(50);
  let isVip = () => false;
  try { ({ isTrustedNurse: isVip } = require('./subscription.controller')); } catch (_) {}
  ResponseHelper.success(res, txs.map((t) => ({
    id: String(t._id),
    amount: t.amount,
    paymentMethod: t.paymentMethod,
    description: t.description,
    createdAt: t.createdAt,
    user: t.user ? { id: String(t.user._id), name: t.user.fullName, email: t.user.email, phone: t.user.phone, payoutMethod: t.user.payoutMethod, payoutAccount: t.user.payoutAccount, walletBalance: t.user.walletBalance, isVipNurse: !!(t.user.subscription && isVip(t.user)) } : null
  })), 'طلبات السحب المعلقة');
});

const reviewWithdrawal = asyncHandler(async (req, res) => {
  const { withdrawalId } = req.params;
  const raw = req.body.action || req.body.status;
  const approve = (raw === 'approve' || raw === 'approved' || raw === 'paid');
  const tx = await Wallet.findOne({ _id: withdrawalId, type: 'withdrawal', status: 'pending' });
  if (!tx) throw new ApiError(404, 'Withdrawal request not found');

  if (approve) {
    tx.status = 'completed';
    tx.description = `Withdrawal approved and paid to nurse (${tx.paymentMethod || 'bank_transfer'})`;
    await tx.save();
    const nurse = await User.findById(tx.user);
    await Notification.create({ recipient: tx.user, title: 'تم إرسال مستحقاتك', message: `أرسلت الإدارة ${tx.amount} ج.م إلى حسابك (${tx.paymentMethod || 'تحويل بنكي'}). تحقق من رصيدك`, type: 'payment', data: { withdrawalId: tx._id } });
    try { const { emitToUser } = require('../sockets'); emitToUser(String(tx.user), 'notification', { title: 'تم إرسال مستحقاتك', withdrawalId: tx._id, amount: tx.amount }); } catch (_) {}
  } else {
    const nurse = await User.findById(tx.user);
    nurse.walletBalance = (nurse.walletBalance || 0) + tx.amount;
    await nurse.save();
    tx.status = 'failed';
    tx.balanceAfter = nurse.walletBalance;
    tx.description = `Withdrawal rejected — refunded to nurse wallet`;
    await tx.save();
    await Notification.create({ recipient: tx.user, title: 'تم رفض طلب السحب', message: `تم رفض طلب سحب ${tx.amount} ج.م وأُعيد المبلغ لمحفظتك`, type: 'payment', data: { withdrawalId: tx._id } });
  }
  ResponseHelper.success(res, { withdrawalId, status: tx.status }, approve ? 'تم تأكيد إرسال المبلغ للممرض' : 'تم الرفض وإرجاع المبلغ');
});

// Admin accepts a nurse price (new offer flow): sets finalPrice, assigns nurse, tells patient to PAY
const approveNurseOffer = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { offerId } = req.body;
  if (!offerId) throw new ApiError(400, 'offerId is required');
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  if (!['open', 'offers_received', 'assigned'].includes(order.status)) throw new ApiError(400, 'Order is no longer open for pricing');
  const offer = order.offers.id(offerId);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.status !== 'pending_review') throw new ApiError(400, 'Offer is not available');
  offer.status = 'approved';
  offer.reviewedBy = req.user.id;
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
  order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: `Admin approved price ${offer.price}` });
  await order.save();
  // Prepaid escrow (if any) moves straight to the assigned nurse
  try {
    const { releaseEscrowToNurse } = require('../utils/releaseEscrow');
    await releaseEscrowToNurse(order);
  } catch (_) { /* best-effort */ }
  await Notification.create({ recipient: order.patient, title: 'تم قبول السعر — ادفع الآن', message: `الإدارة قبلت سعر ${offer.price} ج.م لطلبك #${order.orderNumber} — ادفع من المحفظة أو InstaPay`, type: 'order', data: { orderId: order._id, finalPrice: offer.price } });
  await Notification.create({ recipient: offer.nurse, title: 'تم اختيارك لطلب — أكّد القبول', message: `قبلت الإدارة سعرك ${offer.price} ج.م للطلب #${order.orderNumber} — افتح طلباتك واضغط "موافق" أو "رفض"`, type: 'order', data: { orderId: order._id } });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'assigned', finalPrice: offer.price });
    emitToUser(String(order.patient), 'notification', { title: 'تم قبول السعر — ادفع الآن', orderId: order._id });
    emitToUser(String(offer.nurse), 'notification', { title: 'الإدارة قبلت سعرك', orderId: order._id });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, status: 'assigned', finalPrice: offer.price }, 'تم قبول سعر الممرض — بانتظار دفع المريض');
});

// POST /admin/orders/:orderId/reject-offer {offerId, notes?}
// Admin rejects one nurse price offer and notifies the nurse.
const rejectNurseOffer = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { offerId, notes } = req.body;
  if (!offerId) throw new ApiError(400, 'offerId is required');
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  const offer = order.offers.id(offerId);
  if (!offer) throw new ApiError(404, 'Offer not found');
  if (offer.status !== 'pending_review') throw new ApiError(400, 'Offer is not available');
  offer.status = 'rejected';
  offer.reviewedBy = req.user.id;
  offer.reviewedAt = new Date();
  offer.adminNotes = notes || null;
  order.statusHistory.push({ status: order.status, changedBy: req.user.id, notes: `Admin rejected price ${offer.price}` });
  await order.save();
  await Notification.create({ recipient: offer.nurse, title: 'تم رفض سعرك', message: `رفضت الإدارة سعرك ${offer.price} ج.م للطلب #${order.orderNumber}${notes ? ' — ' + notes : ''}`, type: 'order', data: { orderId: order._id } });
  ResponseHelper.success(res, { orderId, offerId, status: offer.status }, 'تم رفض العرض وإشعار الممرض');
});

// GET /admin/offers — every nurse price (any service) awaiting review, newest first
const getAllOffers = asyncHandler(async (req, res) => {
  const { status } = req.query; // pending_review (default) | approved | rejected | all
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
        patient: {
          $let: {
            vars: { p: { $arrayElemAt: ['$patientDoc', 0] } },
            in: { id: '$$p._id', name: '$$p.fullName', phone: '$$p.phone' }
          }
        },
        offer: {
          id: '$offers._id', price: '$offers.price', status: '$offers.status',
          notes: '$offers.notes', adminNotes: '$offers.adminNotes', createdAt: '$offers.createdAt',
          nurse: {
            $let: {
              vars: { n: { $arrayElemAt: ['$nurseDoc', 0] } },
              in: { id: '$$n._id', name: '$$n.fullName', phone: '$$n.phone', rating: '$$n.rating', specialization: '$$n.specialization' }
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
  })), 'قائمة أسعار الممرضين');
});
// Reset all financial data to zero (fresh start)
const resetAllPayments = asyncHandler(async (req, res) => {
  await User.updateMany({ role: { $in: ['patient', 'nurse'] } }, { $set: { walletBalance: 0 } });
  await Wallet.updateMany({}, { $set: { status: 'failed' } });
  await Wallet.deleteMany({ type: 'fee' });
  const result = await Wallet.aggregate([{ $group: { _id: null, count: { $sum: 1 } } }]);
  ResponseHelper.success(res, {
    message: 'All payments reset to zero',
    remainingTransactions: result[0]?.count || 0,
    timestamp: new Date().toISOString()
  }, 'Payments reset successfully');
});

// GET /admin/nurses - List all nurses
const getAllNurses = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status } = req.query;
  const query = { role: 'nurse' };
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [nurses, total] = await Promise.all([
    User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    User.countDocuments(query)
  ]);
  const mapped = nurses.map((n) => ({
    ...n,
    id: String(n._id),
    name: n.fullName,
    isVerified: n.status === 'approved',
    isOnline: n.isOnline,
    specialization: n.specialization,
    yearsOfExperience: n.yearsOfExperience,
    rating: n.rating,
    totalReviews: n.totalReviews,
    location: n.location,
    phone: n.phone,
    email: n.email
  }));
  ResponseHelper.paginated(res, mapped, { page: parseInt(page), limit: parseInt(limit), total }, 'Nurses list');
});

// GET /admin/patients - List all patients
const getAllPatients = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status } = req.query;
  const query = { role: 'patient' };
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [patients, total] = await Promise.all([
    User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    User.countDocuments(query)
  ]);
  const mapped = patients.map((p) => ({
    ...p,
    id: String(p._id),
    name: p.fullName,
    isVerified: p.status === 'approved' || p.status === 'active',
    isOnline: p.isOnline,
    location: p.location,
    phone: p.phone,
    email: p.email,
    walletBalance: p.walletBalance
  }));
  ResponseHelper.paginated(res, mapped, { page: parseInt(page), limit: parseInt(limit), total }, 'Patients list');
});

const { SERVICE_PRICE_CATALOG } = require('../utils/serviceCatalog');

// POST /admin/set-price - Set the authoritative service price
const setPrice = asyncHandler(async (req, res) => {
  const { serviceId, serviceType, minPrice, maxPrice } = req.body;
  const basePrice = Number(req.body.basePrice ?? req.body.price);
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    throw new ApiError(400, 'Admin service price must be greater than zero');
  }

  let service;
  if (serviceId) {
    service = await Service.findById(serviceId);
    if (!service) throw new ApiError(404, 'Service not found');
  } else {
    const definition = SERVICE_PRICE_CATALOG[String(serviceType || '').toLowerCase()];
    if (!definition) throw new ApiError(400, 'A valid serviceType is required');
    service = await Service.findOne({
      $or: [{ name: definition.name }, { category: definition.category }]
    });
    if (!service) {
      service = new Service({
        ...definition,
        description: `${definition.nameAr} home nursing service`,
        basePrice,
        isActive: true
      });
    }
  }

  service.basePrice = basePrice;
  service.isActive = true;
  if (minPrice != null) service.minPrice = Number(minPrice);
  if (maxPrice != null) service.maxPrice = Number(maxPrice);
  await service.save();
  ResponseHelper.success(res, { service }, 'Service price updated');
});

// GET /admin/prices - Get all service prices
const getPrices = asyncHandler(async (req, res) => {
  const services = await Service.find({ isActive: true }).sort({ createdAt: -1 });
  ResponseHelper.success(res, services, 'Service prices');
});

const deletePrice = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.serviceId);
  if (!service) throw new ApiError(404, 'Service not found');
  service.isActive = false;
  await service.save();
  ResponseHelper.success(res, { serviceId: String(service._id), isActive: false }, 'Service price disabled');
});

// GET /admin/transactions - Get all financial transactions
const getTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type, status } = req.query;
  const query = {};
  if (type) query.type = type;
  if (status) query.status = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [transactions, total] = await Promise.all([
    Wallet.find(query).populate('user', 'fullName email phone').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Wallet.countDocuments(query)
  ]);
  ResponseHelper.paginated(res, transactions, { page: parseInt(page), limit: parseInt(limit), total }, 'Transactions');
});

// POST /admin/send-credentials - Send login credentials to patient/nurse
const sendCredentials = asyncHandler(async (req, res) => {
  const { userId } = req.params || req.body;
  const { email, password } = req.body;
  if (!userId && !email) throw new ApiError(400, 'userId or email is required');
  const user = userId ? await User.findById(userId) : await User.findOne({ email });
  if (!user) throw new ApiError(404, 'User not found');
  const generatedPassword = password || (crypto.randomBytes(4).toString('hex') + 'Qrb@' + Math.floor(Math.random() * 100));
  try { await sendPasswordResetEmail(user.email, generatedPassword); } catch (e) { console.log('Email failed:', e.message); }
  ResponseHelper.success(res, { userId: user._id, email: user.email, password: generatedPassword }, 'Credentials sent');
});

// PUT /admin/nurse-status - Toggle nurse online/offline status
const updateNurseStatus = asyncHandler(async (req, res) => {
  const { nurseId } = req.params;
  const { isOnline } = req.body;
  const nurse = await User.findOne({ _id: nurseId, role: 'nurse' });
  if (!nurse) throw new ApiError(404, 'Nurse not found');
  nurse.isOnline = isOnline !== undefined ? isOnline : !nurse.isOnline;
  await nurse.save();
  ResponseHelper.success(res, { nurseId: nurse._id, isOnline: nurse.isOnline }, 'Nurse status updated');
});

// ============================================================
// ADMIN-ONLY: full credentials + registration vault + online edit
// + helper/assistant accounts with ticked policies.
// All online (same /api origin). Assistants NEVER hit these endpoints
// (router guards authorize('admin')); they get masked views via
// /api/assistant/* instead. Passwords are bcrypt-hashed: readable NEVER,
// resettable ALWAYS.
// ============================================================
const { adminView } = require('../utils/accountView');
const { normalizeScopes, ASSISTANT_SCOPES, ASSISTANT_SCOPE_KEYS } = require('../utils/accountView');

// GET /admin/users/:userId/credentials — every credential + registration
// field for ONE account, decrypted, admin panel only.
const getUserCredentials = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId).select('+sensitiveEnc');
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  if (user.role === 'admin') throw new ApiError(403, 'لا يمكن عرض بيانات أدمن آخر');

  let vault = null;
  try {
    const { decryptObject } = require('../utils/encryption');
    vault = user.sensitiveEnc ? decryptObject(user.sensitiveEnc) : null;
  } catch (_) { vault = null; }

  const view = adminView(user);
  ResponseHelper.success(res, {
    ...view,
    vaultDecrypted: vault || {
      email: user.email, phone: user.phone,
      nationalId: user.nationalId, payoutAccount: user.payoutAccount,
    },
    encryption: { algorithm: 'AES-256-GCM', source: vault ? 'sensitiveEnc' : 'live-fields' },
  }, 'بيانات الحساب الكاملة (مشفرة — للأدمن فقط)');
});

// PUT /admin/users/:userId/full — online edit of ANY account field.
const updateUserFull = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId).select('+password');
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  if (user.role === 'admin') throw new ApiError(403, 'لا يمكن تعديل حساب أدمن');
  if (user.role === 'assistant') throw new ApiError(403, 'Helper accounts are edited from the Helpers page');

  const b = req.body || {};
  const set = {};

  // Identity / registration
  for (const k of ['fullName', 'email', 'phone', 'nationalId', 'gender', 'status', 'specialization', 'bio', 'payoutMethod', 'payoutAccount']) {
    if (b[k] !== undefined) set[k] = b[k];
  }
  if (b.yearsOfExperience !== undefined) {
    const y = Number(b.yearsOfExperience);
    if (!Number.isFinite(y) || y < 0 || y > 50) throw new ApiError(400, 'yearsOfExperience must be 0-50');
    set.yearsOfExperience = y;
  }
  if (b.isActive !== undefined) set.isActive = !!b.isActive;
  if (b.isOnline !== undefined) set.isOnline = !!b.isOnline;
  if (b.role !== undefined) {
    if (!['patient', 'nurse'].includes(b.role)) throw new ApiError(400, 'Role can only change between patient/nurse here');
    set.role = b.role;
  }
  // Location object (merge)
  if (b.location && typeof b.location === 'object') {
    user.location = user.location || {};
    for (const k of ['governorate', 'city', 'address']) {
      if (b.location[k] !== undefined) user.location[k] = b.location[k];
    }
    if (b.location.lat !== undefined || b.location.lng !== undefined) {
      user.location.coordinates = user.location.coordinates || {};
      if (b.location.lat !== undefined) user.location.coordinates.lat = Number(b.location.lat);
      if (b.location.lng !== undefined) user.location.coordinates.lng = Number(b.location.lng);
    }
  }
  // Flat location aliases
  for (const k of ['governorate', 'city', 'address']) {
    if (b[k] !== undefined) {
      user.location = user.location || {};
      user.location[k] = b[k];
    }
  }

  // Uniqueness guard for changed identifiers
  for (const field of ['email', 'phone', 'nationalId']) {
    if (set[field] !== undefined && set[field] !== user[field]) {
      const clash = await User.findOne({ [field]: set[field], _id: { $ne: user._id } });
      if (clash) throw new ApiError(409, `${field} is already registered to another account`);
    }
  }

  Object.assign(user, set);

  // Optional password set (min 6). Hashed on save — never returned.
  let passwordChanged = false;
  if (b.password !== undefined && b.password !== null && String(b.password) !== '') {
    if (String(b.password).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
    user.password = String(b.password);
    passwordChanged = true;
  }

  await user.save();

  await Notification.create({
    recipient: user._id, title: 'تحديث بيانات حسابك',
    message: 'حدّثت الإدارة بيانات حسابك — راجع ملفك الشخصي', type: 'system'
  }).catch(() => {});
  try {
    const { emitToUser } = require('../sockets');
    emitToUser(String(user._id), 'notification', { title: 'تحديث بيانات حسابك' });
  } catch (_) {}

  const fresh = await User.findById(user._id);
  ResponseHelper.success(res, { user: adminView(fresh), passwordChanged }, 'تم حفظ التعديلات أونلاين');
});

// --- Helper / assistant accounts (admin creates, ticks policies) ---
const listAssistants = asyncHandler(async (req, res) => {
  const assistants = await User.find({ role: 'assistant' }).select('-password').sort({ createdAt: -1 }).lean();
  ResponseHelper.success(res, {
    scopes: ASSISTANT_SCOPES,
    assistants: assistants.map((a) => ({
      id: String(a._id), fullName: a.fullName, email: a.email, phone: a.phone,
      assistantLabel: a.assistantLabel || null,
      assistantScopes: Array.isArray(a.assistantScopes) ? a.assistantScopes : [],
      isActive: a.isActive, status: a.status, lastLogin: a.lastLogin || null,
      createdAt: a.createdAt,
    })),
  }, 'Helper accounts');
});

const createAssistant = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password, assistantLabel, scopes } = req.body || {};
  if (!fullName || !email || !phone || !password) {
    throw new ApiError(400, 'fullName, email, phone and password are required');
  }
  if (String(password).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
  const cleanScopes = normalizeScopes(scopes);

  const clash = await User.findOne({ $or: [{ email }, { phone }] });
  if (clash) {
    if (clash.email === email) throw new ApiError(409, 'Email already registered');
    throw new ApiError(409, 'Phone already registered');
  }

  const assistant = await User.create({
    fullName, email, phone, password,
    // Assistants don't register with national ID; keep a unique placeholder.
    nationalId: `9${Date.now().toString().slice(-12)}${String(Math.floor(Math.random() * 10))}`.slice(0, 14).padEnd(14, '0'),
    role: 'assistant',
    status: 'active',
    isActive: true,
    assistantLabel: assistantLabel || null,
    assistantScopes: cleanScopes,
    createdBy: req.user.id,
  });

  ResponseHelper.success(res, {
    assistant: {
      id: String(assistant._id), fullName: assistant.fullName, email: assistant.email,
      phone: assistant.phone, assistantLabel: assistant.assistantLabel,
      assistantScopes: assistant.assistantScopes,
    },
    scopes: ASSISTANT_SCOPES,
  }, 'تم إنشاء حساب المساعد بنجاح', 201);
});

const updateAssistant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const a = await User.findOne({ _id: id, role: 'assistant' });
  if (!a) throw new ApiError(404, 'Assistant not found');
  const b = req.body || {};
  if (b.fullName !== undefined) a.fullName = b.fullName;
  if (b.assistantLabel !== undefined) a.assistantLabel = b.assistantLabel;
  if (b.scopes !== undefined) a.assistantScopes = normalizeScopes(b.scopes);
  if (b.isActive !== undefined) a.isActive = !!b.isActive;
  if (b.password !== undefined && String(b.password) !== '') {
    if (String(b.password).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
    a.password = String(b.password);
  }
  await a.save();
  ResponseHelper.success(res, {
    assistant: {
      id: String(a._id), fullName: a.fullName, email: a.email, phone: a.phone,
      assistantLabel: a.assistantLabel, assistantScopes: a.assistantScopes, isActive: a.isActive,
    },
  }, 'تم تحديث حساب المساعد');
});

const deleteAssistant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const a = await User.findOne({ _id: id, role: 'assistant' });
  if (!a) throw new ApiError(404, 'Assistant not found');
  await User.findByIdAndDelete(id);
  ResponseHelper.success(res, { id }, 'تم حذف حساب المساعد');
});

module.exports = {
  getDashboardStats, getPendingVerifications, getVerificationsCompat, getNurseVerificationDetails, verifyNurse,
  getAllUsers, getUserById, createUser, updateUser, deleteUser, resetUserPassword, toggleUserStatus,
  getAllOrders, getOrderDetails, deleteOrder, reviewOrderPrice, setOrderPrice, updateOrderStatus, getPaymentsStats,
  getPendingTopups, reviewTopup, completeOrder,
  getPendingOrderPayments, reviewOrderPayment,
  getPendingWithdrawals, reviewWithdrawal, approveNurseOffer,
  approveService, suggestOrderPrice, getFeedbacks, getNurseReports, updateService,
  rejectNurseOffer, getAllOffers,
  getAdminEarnings, resetAllPayments,
  getAllNurses, getAllPatients, setPrice, getPrices, deletePrice, getTransactions, sendCredentials, updateNurseStatus,
  getUserCredentials, updateUserFull,
  listAssistants, createAssistant, updateAssistant, deleteAssistant
};
