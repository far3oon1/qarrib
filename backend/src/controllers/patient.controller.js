const User = require('../models/User');
const Order = require('../models/Order');
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
  const { lat, lng, distance = 10 } = req.query;
  if (lat == null || lng == null) throw new ApiError(400, 'lat and lng are required');
  const me = { lat: Number(lat), lng: Number(lng) };
  const nurses = await User.find({ role: 'nurse', status: 'approved', isActive: true }).select('fullName phone specialization yearsOfExperience rating totalReviews location isOnline');
  const mapped = nurses
    .map((n) => {
      const coords = n.location && n.location.coordinates ? n.location.coordinates : null;
      return {
        id: n._id,
        fullName: n.fullName,
        phone: n.phone,
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
module.exports = { getDashboard, updateProfile, updateLocation, getMyOrders, getMyWallet, getNearbyNurses, getOrdersWithOffers, getNursesList };
