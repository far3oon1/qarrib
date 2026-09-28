// Shared fan-out when an order becomes visible to nurses: the nearest
// verified nurses first (tagged with distance), then the rest, then admins.
// Returns the notified lists so callers can do the realtime socket fan-out.
const User = require('../models/User');
const Notification = require('../models/Notification');
const { findNearestNurses } = require('./nearestNurses');

async function notifyNewOrder({ order, serviceDoc, gov, amount, skipAdmins = false }) {
  const serviceName = (serviceDoc && (serviceDoc.nameAr || serviceDoc.name)) || 'خدمة تمريض';
  const coords = order && order.location && order.location.coordinates ? order.location.coordinates : {};

  const nearest = await findNearestNurses({ lat: coords.lat, lng: coords.lng, limit: 10 });
  const nearestIds = nearest.map((x) => x.nurse._id);
  for (const { nurse, distanceKm } of nearest) {
    await Notification.create({
      recipient: nurse._id,
      title: 'طلب جديد قريب منك 📍',
      message: `طلب جديد: ${serviceName} في ${gov} — على بعد ${distanceKm.toFixed(1)} كم منك (السعر: ${amount} ج.م)`,
      type: 'order',
      data: { orderId: order._id, distanceKm: Math.round(distanceKm * 10) / 10 }
    });
  }

  const others = await User.find({
    role: 'nurse', status: 'approved', isActive: true, _id: { $nin: nearestIds }
  }).select('_id').limit(50);
  for (const n of others) {
    await Notification.create({
      recipient: n._id,
      title: 'طلب جديد متاح',
      message: `طلب جديد: ${serviceName} في ${gov} (السعر: ${amount} ج.م)`,
      type: 'order',
      data: { orderId: order._id }
    });
  }
  const nurses = nearest.map((x) => x.nurse).concat(others);

  let admins = [];
  if (!skipAdmins) {
    admins = await User.find({ role: 'admin' }).select('_id').limit(20);
    for (const a of admins) {
      await Notification.create({
        recipient: a._id,
        title: 'طلب خدمة جديد',
        message: `طلب جديد #${order.orderNumber}: ${serviceName} في ${gov} — السعر محدد من الإدارة`,
        type: 'order',
        data: { orderId: order._id }
      });
    }
  }

  return { nurses, admins, nearest };
}

module.exports = { notifyNewOrder };
