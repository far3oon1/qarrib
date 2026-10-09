// Shared money settle for inDrive-style accepts: the patient pays UPFRONT at
// request time (amountHeld), so on accept only the DIFFERENCE moves.
//   accepted > held  -> charge the rest from the patient wallet (must cover it)
//   accepted < held  -> refund the rest to the patient wallet (ledgered)
// Final price / commission / earnings are recomputed from the accepted price.
const ApiError = require('./ApiError');

const round2 = (n) => Math.round(Number(n) * 100) / 100;

async function settleAcceptPrice({ order, patient, acceptedPrice }) {
  const Wallet = require('../models/Wallet');
  const held = Number(order.amountHeld) || 0;
  const accepted = round2(acceptedPrice);
  const diff = round2(accepted - held);

  if (diff > 0) {
    const balance = Number(patient.walletBalance) || 0;
    if (balance < diff) {
      throw new ApiError(400, `السعر المقبول أعلى من المحجوز بـ ${diff} ج.م ورصيدك لا يكفي — اشحن محفظتك أولاً`, [
        { needed: diff, available: balance }
      ]);
    }
    patient.walletBalance = round2(balance - diff);
    await patient.save();
    await Wallet.create({
      user: patient._id, order: order._id, type: 'payment',
      amount: diff, status: 'completed', paymentMethod: 'wallet',
      description: `Top-up hold for accepted price ${accepted} on order ${order.orderNumber}`,
      balanceAfter: patient.walletBalance
    });
  } else if (diff < 0) {
    const back = Math.abs(diff);
    patient.walletBalance = round2((Number(patient.walletBalance) || 0) + back);
    await patient.save();
    await Wallet.create({
      user: patient._id, order: order._id, type: 'refund',
      amount: back, status: 'completed', paymentMethod: order.paymentMethod || 'wallet',
      description: `Refund of over-held amount on order ${order.orderNumber} (accepted ${accepted})`,
      balanceAfter: patient.walletBalance
    });
  }

  const rate = Number(order.commissionRate) > 0 ? Number(order.commissionRate) : 10;
  order.finalPrice = accepted;
  order.amountHeld = accepted;
  order.commission = round2(accepted * (rate / 100));
  order.nurseEarnings = round2(accepted - order.commission);
  order.platformFee = order.commission;
  return { diff, held, accepted };
}

module.exports = { settleAcceptPrice };
