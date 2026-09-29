// Direct-pay helper: when an order is BOTH paid (escrow held) AND assigned,
// the money goes straight to the nurse's wallet balance immediately.
// Returns { released, earning }. Safe to call repeatedly (idempotent).
async function releaseEscrowToNurse(order, options) {
  options = options || {};
  if (!order || order.escrowStatus !== 'held' || !order.assignedNurse) {
    return { released: false, earning: 0 };
  }
  const User = require('../models/User');
  const Wallet = require('../models/Wallet');
  const Notification = require('../models/Notification');

  const nurse = await User.findById(order.assignedNurse);
  if (!nurse) return { released: false, earning: 0 };

  const earning = order.nurseEarnings || 0;
  nurse.walletBalance = (nurse.walletBalance || 0) + earning;
  await nurse.save();

  await Wallet.create({
    user: nurse._id, order: order._id, type: 'earning',
    amount: earning, status: 'completed', paymentMethod: order.paymentMethod,
    description: `Earnings for order ${order.orderNumber} (paid directly on patient payment)`,
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

  order.escrowStatus = 'released';
  order.paymentStatus = 'paid';
  await order.save();

  await Notification.create({
    recipient: nurse._id, title: 'تم تحويل مستحقاتك',
    message: `تمت إضافة ${earning} ج.م إلى رصيد محفظتك عن الطلب #${order.orderNumber}`,
    type: 'order', data: { orderId: order._id, earning }
  });
  try {
    const { emitToOrder, emitToUser } = require('../sockets');
    emitToOrder(String(order._id), 'order_update', { orderId: order._id, escrowStatus: 'released', paidToNurse: earning });
    emitToUser(String(nurse._id), 'notification', { title: 'تم تحويل مستحقاتك', orderId: order._id, earning });
  } catch (_) { /* sockets optional */ }

  return { released: true, earning };
}

module.exports = { releaseEscrowToNurse };
