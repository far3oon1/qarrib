const Order = require('../models/Order');
const User = require('../models/User');
const Service = require('../models/Service');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { uploadToCloudinary } = require('../config/cloudinary');
const fs = require('fs');

const createOrder = asyncHandler(async (req, res) => {
  const { service, description, governorate, city, address, preferredDate, preferredTime } = req.body;

  const serviceDoc = await Service.findById(service);
  if (!serviceDoc) throw new ApiError(404, 'الخدمة غير موجودة');

  const orderImages = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      try {
        const result = await uploadToCloudinary(file.path, 'qarrab/orders');
        orderImages.push({ url: result.url, publicId: result.publicId });
        fs.unlinkSync(file.path);
      } catch (err) {
        console.log('Cloudinary not configured, skipping image upload');
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
    }
  }

  const order = await Order.create({
    patient: req.user.id, service, description, images: orderImages,
    location: { governorate, city, address },
    preferredDate: new Date(preferredDate), preferredTime: preferredTime || 'anytime',
    status: 'open',
    statusHistory: [{ status: 'open', changedBy: req.user.id, notes: 'تم إنشاء الطلب' }]
  });

  const nurses = await User.find({ role: 'nurse', status: 'approved', isActive: true }).limit(20);
  for (const nurse of nurses) {
    await Notification.create({ recipient: nurse._id, title: 'طلب جديد متاح', message: `طلب جديد لخدمة ${serviceDoc.nameAr} في ${governorate}`, type: 'order', data: { orderId: order._id } });
  }

  ResponseHelper.success(res, { order: await Order.findById(order._id).populate('service', 'nameAr').populate('patient', 'fullName phone') }, 'تم إنشاء الطلب بنجاح', 201);
});

const getMyOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const query = { patient: req.user.id };
  if (status) query.status = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [orders, total] = await Promise.all([
    Order.find(query).populate('service', 'nameAr icon').populate('assignedNurse', 'fullName phone rating').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Order.countDocuments(query)
  ]);

  ResponseHelper.paginated(res, orders, { page: parseInt(page), limit: parseInt(limit), total }, 'طلباتي');
});

const getOrderDetails = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findOne({ _id: orderId, patient: req.user.id })
    .populate('service', 'nameAr description basePrice')
    .populate('assignedNurse', 'fullName phone rating')
    .populate('offers.nurse', 'fullName phone rating yearsOfExperience specialization');

  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  ResponseHelper.success(res, { order }, 'تفاصيل الطلب');
});

const payForOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { paymentMethod } = req.body;

  const order = await Order.findOne({ _id: orderId, patient: req.user.id, status: 'price_approved' });
  if (!order) throw new ApiError(404, 'الطلب غير موجود أو غير متاح للدفع');

  order.paymentStatus = 'paid';
  order.paymentMethod = paymentMethod;
  order.status = 'assigned';
  const offer = order.offers.find(o => o._id.equals(order.selectedOffer));
  order.assignedNurse = offer ? offer.nurse : null;
  order.statusHistory.push({ status: 'assigned', changedBy: req.user.id, notes: `تم الدفع عبر ${paymentMethod}` });
  await order.save();

  await Notification.create({ recipient: order.assignedNurse, title: 'تم تعيينك لطلب', message: `تم الدفع للطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  ResponseHelper.success(res, { orderId, status: 'assigned', assignedNurse: order.assignedNurse }, 'تم الدفع وتعيين الممرض');
});

const getAvailableOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, governorate } = req.query;
  const query = { status: { $in: ['open', 'offers_received'] }, 'offers.nurse': { $ne: req.user.id } };
  if (governorate) query['location.governorate'] = governorate;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [orders, total] = await Promise.all([
    Order.find(query).populate('service', 'nameAr basePrice').populate('patient', 'fullName').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Order.countDocuments(query)
  ]);

  ResponseHelper.paginated(res, orders, { page: parseInt(page), limit: parseInt(limit), total }, 'الطلبات المتاحة');
});

const submitOffer = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { price, notes } = req.body;

  if (req.user.status !== 'approved' && req.user.status !== 'active') {
    throw new ApiError(403, 'Your account is not verified yet');
  }

  const order = await Order.findById(orderId);
  if (!order) throw new ApiError(404, 'الطلب غير موجود');
  if (!['open', 'offers_received', 'assigned'].includes(order.status)) throw new ApiError(400, 'الطلب غير متاح لإرسال عروض');

  const existingOffer = order.offers.find(o => o.nurse.toString() === req.user.id);
  if (existingOffer) throw new ApiError(400, 'لقد قدمت عرضاً مسبقاً لهذا الطلب');

  order.offers.push({ nurse: req.user.id, price, notes: notes || null, status: 'pending_review' });
  if (order.status === 'open') {
    order.status = 'offers_received';
    order.statusHistory.push({ status: 'offers_received', changedBy: req.user.id, notes: 'تم استلام عرض جديد' });
  }
  await order.save();

  const admins = await User.find({ role: 'admin' });
  for (const admin of admins) {
    await Notification.create({ recipient: admin._id, title: 'عرض جديد يحتاج مراجعة', message: `عرض بقيمة ${price} ج.م للطلب #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });
  }
  // Also notify the patient that a nurse priced his request
  await Notification.create({ recipient: order.patient, title: 'عرض سعر جديد', message: `ممرض عرض ${price} ج.م لطلبك #${order.orderNumber} — بانتظار موافقة الإدارة`, type: 'order', data: { orderId: order._id } });

  try {
    const { emitToUser, emitToOrder } = require('../sockets');
    admins.forEach((a) => emitToUser(String(a._id), 'notification', { title: 'عرض جديد يحتاج مراجعة', orderId: order._id, price }));
    emitToUser(String(order.patient), 'notification', { title: 'عرض سعر جديد', orderId: order._id, price });
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: order.status, newOfferPrice: price });
  } catch (_) { /* sockets optional */ }

  ResponseHelper.success(res, { orderId, offerPrice: price, status: 'pending_review' }, 'تم إرسال العرض، في انتظار مراجعة الأدمن');
});

const getMyOffers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const orders = await Order.find({ 'offers.nurse': req.user.id }).populate('service', 'nameAr').populate('patient', 'fullName').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
  const myOffers = orders.map(order => {
    const myOffer = order.offers.find(o => o.nurse.toString() === req.user.id);
    return { orderId: order._id, orderNumber: order.orderNumber, service: order.service, patient: order.patient, status: order.status, myOffer: { price: myOffer.price, status: myOffer.status, notes: myOffer.notes, createdAt: myOffer.createdAt }, createdAt: order.createdAt };
  });

  const total = await Order.countDocuments({ 'offers.nurse': req.user.id });
  ResponseHelper.paginated(res, myOffers, { page: parseInt(page), limit: parseInt(limit), total }, 'عروضي');
});

const getAssignedOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const query = { assignedNurse: req.user.id };
  if (status) query.status = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [orders, total] = await Promise.all([
    Order.find(query).populate('service', 'nameAr').populate('patient', 'fullName phone location').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Order.countDocuments(query)
  ]);

  ResponseHelper.paginated(res, orders, { page: parseInt(page), limit: parseInt(limit), total }, 'طلباتي المعينة');
});

const updateNurseOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  const order = await Order.findOne({ _id: orderId, assignedNurse: req.user.id });
  if (!order) throw new ApiError(404, 'الطلب غير موجود');

  const validTransitions = { 'assigned': ['in_progress'], 'in_progress': ['completed'] };
  if (!validTransitions[order.status]?.includes(status)) throw new ApiError(400, `لا يمكن تغيير الحالة من ${order.status} إلى ${status}`);

  order.status = status;
  order.statusHistory.push({ status, changedBy: req.user.id, notes: 'تم تحديث الحالة من قبل الممرض' });
  if (status === 'completed') {
    order.completedAt = new Date();
    order.nurseConfirmed = true;
  }
  await order.save();

  await Notification.create({ recipient: order.patient, title: status === 'in_progress' ? 'بدأت الخدمة' : 'تم إنجاز الخدمة', message: status === 'in_progress' ? `الممرض بدأ تنفيذ طلبك #${order.orderNumber}` : `تم إنجاز طلبك #${order.orderNumber}`, type: 'order', data: { orderId: order._id } });

  if (status === 'completed' && order.nurseConfirmed) {
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const a of admins) {
      await Notification.create({ recipient: a._id, title: 'طلب جاهز للإنجاز', message: `الطلب #${order.orderNumber} منجز — أكّد الإنجاز لتحويل ${order.nurseEarnings || 0} ج.م للممرض`, type: 'order', data: { orderId: order._id, nurseEarnings: order.nurseEarnings || 0 } });
    }
    try {
      const { emitToOrder } = require('../sockets');
      emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'completed', pendingAdminPayment: true, nurseEarnings: order.nurseEarnings || 0 });
    } catch (_) {}
  }

  ResponseHelper.success(res, { orderId, status }, 'تم تحديث حالة الطلب');
});

module.exports = {
  createOrder, getMyOrders, getOrderDetails, payForOrder,
  getAvailableOrders, submitOffer, getMyOffers, getAssignedOrders, updateNurseOrderStatus
};
