const User = require('../models/User');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const ResponseHelper = require('../utils/response');
const ApiError = require('../utils/ApiError');
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
  const orders = await Order.find({ assignedNurse: req.user.id }).sort({ createdAt: -1 });
  const active = orders.filter((o) => ['assigned', 'in_progress'].includes(o.status));
  const completed = orders.filter((o) => o.status === 'completed');
  const earnings = completed.reduce((s, o) => s + (o.nurseEarnings || 0), 0);
  ResponseHelper.success(res, {
    user: {
      id: req.user.id,
      fullName: req.user.fullName,
      walletBalance: req.user.walletBalance || 0,
      rating: req.user.rating,
      status: req.user.status,
      isOnline: req.user.isOnline
    },
    stats: { totalOrders: orders.length, activeOrders: active.length, completedOrders: completed.length, totalEarnings: earnings },
    activeOrders: active.slice(0, 5),
    recentOrders: orders.slice(0, 5)
  }, 'Nurse dashboard');
});

const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phone, specialization, yearsOfExperience, bio, governorate, city, address, payoutMethod, payoutAccount } = req.body;
  const updates = {};
  if (fullName) updates.fullName = fullName;
  if (phone) updates.phone = phone;
  if (specialization) updates.specialization = specialization;
  if (yearsOfExperience != null) updates.yearsOfExperience = Number(yearsOfExperience);
  if (bio !== undefined) updates.bio = bio;
  if (payoutMethod !== undefined) updates.payoutMethod = payoutMethod || null;
  if (payoutAccount !== undefined) updates.payoutAccount = String(payoutAccount).trim() || null;
  const loc = { ...(req.user.location || {}) };
  if (governorate) loc.governorate = governorate;
  if (city) loc.city = city;
  if (address) loc.address = address;
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
      { _id: orderId, assignedNurse: req.user.id },
      { nurseLiveLocation: { lat: Number(lat), lng: Number(lng), updatedAt: new Date() } }
    );
  }
  try {
    const { emitToOrder } = require('../sockets');
    if (orderId) emitToOrder(String(orderId), 'location_update', { userId: String(req.user.id), role: 'nurse', lat: Number(lat), lng: Number(lng), timestamp: new Date().toISOString() });
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, { location: user.location.coordinates }, 'Location updated');
});

const getRequests = asyncHandler(async (req, res) => {
  if (req.user.status !== 'approved' && req.user.status !== 'active') {
    throw new ApiError(403, 'Your account is not verified yet. Please wait for admin approval.');
  }
  const orders = await Order.find({ status: { $in: ['open', 'offers_received'] } })
    .populate('service', 'nameAr basePrice')
    .populate('patient', 'fullName')
    .sort({ createdAt: -1 })
    .limit(50);
  const mine = req.user.location && req.user.location.coordinates ? req.user.location.coordinates : null;
  const sorted = orders
    .map((o) => ({ order: o, d: mine && o.location && o.location.coordinates ? distanceKm(mine, o.location.coordinates) : Infinity }))
    .sort((a, b) => a.d - b.d)
    .map((x) => {
      const s = shapeOrder(x.order);
      const myOffer = (x.order.offers || []).find((o) => String(o.nurse) === String(req.user.id));
      s.hasMyOffer = !!myOffer;
      s.myOfferPrice = myOffer ? myOffer.price : null;
      return s;
    });
  ResponseHelper.success(res, sorted, 'Available requests');
});

const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ assignedNurse: req.user.id })
    .populate('service', 'nameAr basePrice')
    .populate('patient', 'fullName phone')
    .sort({ createdAt: -1 });
  ResponseHelper.success(res, orders.map(shapeOrder), 'Nurse orders');
});

const getMyWallet = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const transactions = await Wallet.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(20);
  ResponseHelper.success(res, { balance: user.walletBalance || 0, transactions }, 'Nurse wallet');
});

const toggleOnlineStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  user.isOnline = !user.isOnline;
  await user.save();
  ResponseHelper.success(res, { isOnline: user.isOnline }, user.isOnline ? 'You are now online' : 'You are now offline');
});

const nurseTransfers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [txs, total] = await Promise.all([
    Wallet.find({ user: req.user.id, type: 'transfer', status: 'completed' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('order', 'orderNumber'),
    Wallet.countDocuments({ user: req.user.id, type: 'transfer', status: 'completed' })
  ]);
  ResponseHelper.paginated(res, txs.map((t) => ({
    id: String(t._id),
    amount: t.amount,
    description: t.description,
    createdAt: t.createdAt,
    balanceAfter: t.balanceAfter,
    order: t.order ? { id: String(t.order._id || t.order), orderNumber: t.order.orderNumber || '' } : null
  })), { page: parseInt(page), limit: parseInt(limit), total }, 'Incoming transfers');
});

module.exports = { getDashboard, updateProfile, updateLocation, getRequests, getMyOrders, getMyWallet, toggleOnlineStatus, nurseTransfers };
