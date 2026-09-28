const User = require('../models/User');
const Order = require('../models/Order');
const Service = require('../models/Service');
const Wallet = require('../models/Wallet');
const ApiError = require('../utils/ApiError');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { shapeOrder } = require('../utils/orderShape');

const toRad = (d) => (d * Math.PI) / 180;
const distanceKm = (a, b) => {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const getDashboard = asyncHandler(async (req, res) => {
  const orders = await Order.find({ patient: req.user.id })
    .populate('service', 'nameAr basePrice')
    .populate('assignedNurse', 'fullName phone')
    .populate('offers.nurse', 'fullName phone rating specialization')
    .sort({ createdAt: -1 });
  const shaped = orders.map(shapeOrder);
  const active = shaped.filter((o) => ['open', 'offers_received', 'under_review', 'price_approved', 'paid', 'assigned', 'in_progress'].includes(o.status));
  const completed = shaped.filter((o) => o.status === 'completed');
  ResponseHelper.success(res, {
    user: {
      id: req.user.id,
      fullName: req.user.fullName,
      name: req.user.fullName,
      walletBalance: req.user.walletBalance || 0,
      location: req.user.location
    },
    stats: { totalOrders: shaped.length, activeOrders: active.length, completedOrders: completed.length },
    activeOrders: active.slice(0, 5),
    recentOrders: shaped.slice(0, 5)
  }, 'Patient dashboard');
});

const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phone, governorate, city, address, lat, lng } = req.body;
  const updates = {};
  if (fullName) updates.fullName = fullName;
  if (phone) updates.phone = phone;
  const loc = { ...(req.user.location || {}) };
  if (governorate) loc.governorate = governorate;
  if (city) loc.city = city;
  if (address) loc.address = address;
  if (lat != null && lng != null) loc.coordinates = { lat: Number(lat), lng: Number(lng) };
  if (Object.keys(loc).length) updates.location = loc;
  const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
  ResponseHelper.success(res, { user }, 'Profile updated');
});

const updateLocation = asyncHandler(async (req, res) => {
  const { lat, lng, orderId } = req.body;
  if (lat == null || lng == null) throw new ApiError(400, 'lat and lng are required');
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { 'location.coordinates': { lat: Number(lat), lng: Number(lng) } },
    { new: true }
  );
  if (orderId) {
    await Order.findOneAndUpdate(
      { _id: orderId, patient: req.user.id },
      { patientLiveLocation: { lat: Number(lat), lng: Number(lng), updatedAt: new Date() } }
    );
  }
  try {
    const { emitToOrder } = require('../sockets');
    if (orderId) emitToOrder(String(orderId), 'location_update', { userId: String(req.user.id), role: 'patient', lat: Number(lat), lng: Number(lng), timestamp: new Date().toISOString() });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { location: user.location.coordinates }, 'Location updated');
});

const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ patient: req.user.id })
    .populate('service', 'nameAr basePrice')
    .populate('assignedNurse', 'fullName phone rating')
    .populate('offers.nurse', 'fullName phone rating specialization yearsOfExperience')
    .sort({ createdAt: -1 });
  ResponseHelper.success(res, orders.map(shapeOrder), 'Patient orders');
});

const getMyWallet = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const transactions = await Wallet.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(20);
  ResponseHelper.success(res, { balance: user.walletBalance || 0, transactions }, 'Patient wallet');
});

const getNearbyNurses = asyncHandler(async (req, res) => {
  const { lat, lng, distance = 50 } = req.query;
  if (lat == null || lng == null) throw new ApiError(400, 'lat and lng are required');
  const me = { lat: Number(lat), lng: Number(lng) };
  const nurses = await User.find({
    role: 'nurse', status: 'approved', isActive: true, isOnline: true,
    'location.coordinates.lat': { $ne: null },
    'location.coordinates.lng': { $ne: null }
  }).select('fullName specialization yearsOfExperience rating totalReviews location isOnline');
  const mapped = nurses
    .map((n) => {
      const coords = n.location && n.location.coordinates ? n.location.coordinates : null;
      return {
        id: n._id,
        fullName: n.fullName,
        specialization: n.specialization,
        yearsOfExperience: n.yearsOfExperience,
        rating: n.rating,
        totalReviews: n.totalReviews,
        location: n.location,
        isOnline: n.isOnline,
        distanceKm: coords ? distanceKm(me, coords) : Infinity
      };
    })
    .filter((n) => n.distanceKm <= Number(distance))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  ResponseHelper.success(res, mapped, 'Nearby nurses');
});

const getOrdersWithOffers = asyncHandler(async (req, res) => {
  const orders = await Order.find({ patient: req.user.id, status: { $in: ['offers_received', 'assigned', 'price_approved'] } })
    .populate('service', 'nameAr basePrice')
    .populate('patient', 'fullName phone')
    .populate('assignedNurse', 'fullName phone rating')
    .populate('offers.nurse', 'fullName phone rating specialization yearsOfExperience')
    .sort({ createdAt: -1 });
  const shaped = orders.map(shapeOrder);
  ResponseHelper.success(res, shaped, 'Orders with offers');
});


const getNursesList = asyncHandler(async (req, res) => {
  const nurses = await User.find({ role: 'nurse', status: 'approved', isActive: true })
    .select('fullName gender specialization yearsOfExperience rating')
    .lean();
  const mapped = nurses.map((n) => ({
    ...n,
    id: String(n._id),
    name: n.fullName,
    isVerified: true
  }));
  ResponseHelper.success(res, mapped, 'Nurses list');
});

const requestService = asyncHandler(async (req, res) => {
  const { nurseId, serviceType, description } = req.body;
  const patient = req.user;
  const location = patient.location || {};
  const { governorate, city, address, coordinates } = location;
  const plat = coordinates?.lat || 30.0444;
  const plng = coordinates?.lng || 31.2357;
  const { emitToOrder, emitToNurses } = require('../sockets');

  let serviceDoc = null;
  if (serviceType) {
    const { resolveServiceType } = require('../utils/serviceCatalog');
    const wanted = resolveServiceType(serviceType);
    serviceDoc = wanted
      ? await Service.findOne({ $or: [{ name: wanted.name }, { category: wanted.category }], isActive: true })
      : await Service.findOne({ $or: [{ name: serviceType }, { nameAr: serviceType }], isActive: true });
  }
  if (!serviceDoc) throw new ApiError(400, 'هذه الخدمة غير موجودة');
  // Admin pricing comes first: unpriced requests wait in review (same as /orders/create)
  const { adminPriceOf } = require('../utils/adminPricing');
  const pricedService = serviceDoc.isActive !== false && adminPriceOf(serviceDoc) != null;

  const order = await Order.create({
    patient: patient._id, service: serviceDoc._id,
    description: (description || '').trim() || ('طلب خدمة: ' + serviceDoc.nameAr),
    location: { governorate: governorate || 'Cairo', city: city || 'Cairo', address: address || '', coordinates: { lat: plat, lng: plng } },
    preferredDate: new Date(), preferredTime: 'anytime', status: pricedService ? 'open' : 'under_review',
    statusHistory: [{ status: pricedService ? 'open' : 'under_review', changedBy: patient._id, notes: 'Request created' }]
  });

  const { notifyNewOrder } = require('../utils/notifyOrder');
  if (pricedService) {
    const { nurses } = await notifyNewOrder({ order, serviceDoc, gov: governorate || 'Cairo', amount: adminPriceOf(serviceDoc) });
    emitToOrder(order._id, 'new_order', { orderId: order._id, governorate: governorate || 'Cairo' });
    try {
      const { emitToUser } = require('../sockets');
      nurses.forEach((n) => emitToUser(String(n._id), 'notification', { title: 'طلب جديد متاح', orderId: order._id }));
    } catch (_) { /* sockets optional */ }
  } else {
    const admins = await User.find({ role: 'admin' }).select('_id').limit(20);
    for (const a of admins) {
      await Notification.create({ recipient: a._id, title: 'طلب جديد يحتاج تسعير 💰', message: `طلب جديد #${order.orderNumber}: ${serviceDoc.nameAr} — حدد السعر ليظهر للممرضين`, type: 'order', data: { orderId: order._id } });
    }
    await Notification.create({ recipient: patient._id, title: 'طلبك قيد مراجعة الإدارة', message: `استلمنا طلبك (${serviceDoc.nameAr}) — الإدارة ستحدد السعر قريباً`, type: 'order', data: { orderId: order._id } });
  }

  const populated = await Order.findById(order._id).populate('service', 'nameAr basePrice').populate('patient', 'fullName phone');
  const { shapeOrder } = require('../utils/orderShape');
  ResponseHelper.success(res, shapeOrder(populated), pricedService ? 'Request created successfully' : 'تم استلام طلبك — قيد مراجعة الإدارة لتحديد السعر', 201);
});

const giveFeedback = asyncHandler(async (req, res) => {
  const { rating, review } = req.body;
  const { orderId } = req.params;
  if (!rating || rating < 1 || rating > 5) throw new ApiError(400, 'Rating must be between 1 and 5');
  const order = await Order.findById(orderId);
  if (!order || order.status !== 'completed') throw new ApiError(400, 'Order must be completed to rate');
  order.patientReview = { rating, comment: review || null, createdAt: new Date() };
  await order.save();
  if (order.assignedNurse) {
    const nurse = await User.findById(order.assignedNurse);
    const total = (nurse.totalReviews || 0) + 1;
    const avg = ((nurse.rating || 0) * (nurse.totalReviews || 0) + rating) / total;
    nurse.rating = Math.round(avg * 10) / 10;
    nurse.totalReviews = total;
    await nurse.save();
  }
  ResponseHelper.success(res, { orderId }, 'Rating submitted successfully');
});

module.exports = { getDashboard, updateProfile, updateLocation, getMyOrders, getMyWallet, getNearbyNurses, getOrdersWithOffers, getNursesList, requestService, giveFeedback };
