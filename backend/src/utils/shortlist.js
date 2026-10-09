// Shared: open a request to nurses with a 3-4 nearest-nurse shortlist.
// Used by every path that makes an order visible (fresh wallet-paid request,
// patient-accepted admin price, admin set-price / approve-service, approved
// manual transfer). Keeps one consistent Uber-style matching model.
const Notification = require('../models/Notification');
const { pickMatchNurses, MATCH_LIMIT_DEFAULT } = require('./matchNurses');

async function openAndShortlist({ order, serviceDoc, gov, amount, actorId, actorNote, notifyPatient = true }) {
  const serviceName = (serviceDoc && (serviceDoc.nameAr || serviceDoc.name)) || 'خدمة تمريض';
  const coords = (order.location && order.location.coordinates) || {};
  const picks = await pickMatchNurses({ lat: coords.lat, lng: coords.lng, limit: MATCH_LIMIT_DEFAULT });
  const bid = order.patientOfferedPrice != null ? order.patientOfferedPrice : amount;

  order.matchedNurses = picks.map((p) => ({ nurse: p.nurse, distanceKm: p.distanceKm, status: 'pending', invitedAt: new Date() }));
  order.matchRound = (order.matchRound || 0) + 1;
  order.matchExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  if (order.status !== 'open') {
    order.status = 'open';
    order.statusHistory.push({ status: 'open', changedBy: actorId || order.patient, notes: actorNote || 'Request opened to nurses' });
  }
  await order.save();

  for (const p of picks) {
    await Notification.create({
      recipient: p.nurse,
      title: 'طلب جديد قريب منك 📍',
      message: `طلب جديد: ${serviceName} في ${gov}${p.distanceKm != null ? ` — على بعد ${p.distanceKm} كم` : ''} — سعر الطلب ${bid} ج.م (الثابت ${amount} ج.م) — اقترح سعرك (الثابت أو أعلى)`,
      type: 'order',
      data: { orderId: order._id, shortlisted: true, distanceKm: p.distanceKm, patientBid: bid, basePrice: amount }
    });
  }
  // inDrive-style breadth: every other approved nurse also sees the request
  // (general ping, no duplicate for the shortlisted ones) so MANY nurses can
  // counter the bid and the patient can accept or reject each price.
  const { notifyNewOrder } = require('./notifyOrder');
  const { nurses: rest } = await notifyNewOrder({
    order, serviceDoc, gov, amount,
    skipAdmins: true, excludeIds: picks.map((p) => String(p.nurse))
  });
  if (notifyPatient) {
    await Notification.create({
      recipient: order.patient, title: 'طلبك ظاهر للممرضين 🟢',
      message: `طلبك #${order.orderNumber} (${serviceName}) ظهر الآن لأقرب الممرضين — قارن أسعارهم واختر من صفحة الاختيار`,
      type: 'order', data: { orderId: order._id }
    });
  }
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    if (emitToOrder) emitToOrder(String(order._id), 'order_update', { orderId: order._id, status: 'open', finalPrice: amount, matchCount: picks.length });
    if (emitToUser) {
      picks.forEach((p) => { try { emitToUser(String(p.nurse), 'notification', { title: 'طلب جديد قريب منك 📍', orderId: order._id, shortlisted: true }); } catch (_) {} });
      rest.forEach((n) => { try { emitToUser(String(n._id), 'notification', { title: 'طلب جديد متاح', orderId: order._id }); } catch (_) {} });
      emitToUser(String(order.patient), 'notification', { title: 'طلبك ظاهر للممرضين 🟢', orderId: order._id });
    }
  } catch (_) { /* sockets optional */ }
  return picks;
}

module.exports = { openAndShortlist };
