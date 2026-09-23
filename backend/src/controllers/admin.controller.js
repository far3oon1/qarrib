const User = require('../models/User');
const Order = require('../models/Order');
const VerificationLog = require('../models/VerificationLog');
const Notification = require('../models/Notification');
const Wallet = require('../models/Wallet');
const ApiError = require('../utils/ApiError');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { deleteFromCloudinary } = require('../config/cloudinary');
const { sendPasswordResetEmail } = require('../utils/email');
const crypto = require('crypto');

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

  ResponseHelper.success(res, { userId, isActive: user.isActive }, user.isActive ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب');
});

const getAllOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const query = {};
  if (status) query.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [orders, total] = await Promise.all([
    Order.find(query).populate('patient', 'fullName phone').populate('service', 'nameAr basePrice').populate('assignedNurse', 'fullName phone').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Order.countDocuments(query)
  ]);

  // Legacy aliases for orders.html (id / serviceType / patient.name / nurse.name / amount)
  const mapped = orders.map((o) => ({
    ...o,
    id: String(o._id),
    serviceType: o.service?.nameAr || 'تمريض منزلي',
    patient: o.patient ? { ...o.patient, id: String(o.patient._id), name: o.patient.fullName } : null,
    nurse: o.assignedNurse ? { ...o.assignedNurse, id: String(o.assignedNurse._id), name: o.assignedNurse.fullName } : null,
    amount: o.finalPrice ?? o.service?.basePrice ?? 0
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

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status, notes } = req.body;

  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');

  order.status = status;
  order.statusHistory.push({ status, changedBy: req.user.id, notes: notes || null });
  if (status === 'completed') order.completedAt = new Date();
  await order.save();

  ResponseHelper.success(res, { orderId, status }, 'تم تحديث حالة الطلب');
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

// Admin approves completion: money goes DIRECTLY to the nurse (owner rule).
const completeOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
    throw new ApiError(400, 'Order is already closed');
  }
  if (!order.assignedNurse) throw new ApiError(400, 'No nurse assigned to this order');
  if (order.escrowStatus === 'cancelled') throw new ApiError(400, 'This order was cancelled');

  const nurse = await User.findById(order.assignedNurse);
  const earning = order.nurseEarnings || 0;
  nurse.walletBalance = (nurse.walletBalance || 0) + earning;
  await nurse.save();
  await Wallet.create({
    user: nurse._id, order: order._id, type: 'earning',
    amount: earning, status: 'completed', paymentMethod: order.paymentMethod,
    description: `Earnings for order ${order.orderNumber} (admin approved)`,
    balanceAfter: nurse.walletBalance
  });
  const platformFee = order.platformFee || 0;
  if (platformFee > 0) {
    await Wallet.create({
      user: nurse._id, order: order._id, type: 'fee',
      amount: platformFee, status: 'completed', paymentMethod: order.paymentMethod,
      description: `Platform fee (${(order.commissionRate || 10)}%) for order ${order.orderNumber}`,
      balanceAfter: nurse.walletBalance
    });
  }

  order.status = 'completed';
  order.completedAt = new Date();
  order.escrowStatus = 'released';
  order.paymentStatus = 'paid';
  order.statusHistory.push({ status: 'completed', changedBy: req.user.id, notes: 'Admin approved completion — paid to nurse' });
  await order.save();

  await Notification.create({ recipient: order.patient, title: 'تم إنجاز طلبك', message: `تمت الموافقة على إنجاز طلبك #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  await Notification.create({ recipient: nurse._id, title: 'تم تحويل مستحقاتك', message: `تمت إضافة ${earning} ج.م إلى محفظتك`, type: 'order', data: { orderId: order._id } });

  ResponseHelper.success(res, { orderId: order._id, status: 'completed', paidToNurse: earning }, 'تمت الموافقة وتحويل المبلغ للممرض');
});

// Nurse withdrawals: list pending (with nurse payout account) + approve/reject
const getPendingWithdrawals = asyncHandler(async (req, res) => {
  const txs = await Wallet.find({ type: 'withdrawal', status: 'pending' })
    .populate('user', 'fullName email phone payoutMethod payoutAccount walletBalance')
    .sort({ createdAt: -1 })
    .limit(50);
  ResponseHelper.success(res, txs.map((t) => ({
    id: String(t._id),
    amount: t.amount,
    paymentMethod: t.paymentMethod,
    description: t.description,
    createdAt: t.createdAt,
    user: t.user ? { id: String(t.user._id), name: t.user.fullName, email: t.user.email, phone: t.user.phone, payoutMethod: t.user.payoutMethod, payoutAccount: t.user.payoutAccount, walletBalance: t.user.walletBalance } : null
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
  order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: `Admin approved price ${offer.price}` });
  await order.save();
  await Notification.create({ recipient: order.patient, title: 'تم قبول السعر — ادفع الآن', message: `الإدارة قبلت سعر ${offer.price} ج.م لطلبك #${order.orderNumber} — ادفع من المحفظة أو InstaPay`, type: 'order', data: { orderId: order._id, finalPrice: offer.price } });
  await Notification.create({ recipient: offer.nurse, title: 'الإدارة قبلت سعرك', message: `قبلت الإدارة سعرك ${offer.price} ج.م للطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'assigned', finalPrice: offer.price });
    emitToUser(String(order.patient), 'notification', { title: 'تم قبول السعر — ادفع الآن', orderId: order._id });
    emitToUser(String(offer.nurse), 'notification', { title: 'الإدارة قبلت سعرك', orderId: order._id });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { orderId: order._id, status: 'assigned', finalPrice: offer.price }, 'تم قبول سعر الممرض — بانتظار دفع المريض');
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

module.exports = {
  getDashboardStats, getPendingVerifications, getVerificationsCompat, getNurseVerificationDetails, verifyNurse,
  getAllUsers, getUserById, updateUser, deleteUser, resetUserPassword, toggleUserStatus,
  getAllOrders, getOrderDetails, reviewOrderPrice, updateOrderStatus, getPaymentsStats,
  getPendingTopups, reviewTopup, completeOrder,
  getPendingWithdrawals, reviewWithdrawal, approveNurseOffer,
  getAdminEarnings, resetAllPayments
};
