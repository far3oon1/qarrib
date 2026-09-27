const User = require('../models/User');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const ResponseHelper = require('../utils/response');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { createCardPayment, createWalletPayment, createInstapayPayment } = require('../config/paymob');

const billingOf = (user) => {
  const parts = String(user.fullName || 'User').split(' ');
  return {
    firstName: parts[0] || 'User',
    lastName: parts.slice(1).join(' ') || 'User',
    email: user.email,
    phone: user.phone,
    street: (user.location && user.location.address) || 'NA',
    city: 'Cairo',
    country: 'EG'
  };
};

const initiate = (kind) => asyncHandler(async (req, res) => {
  const { amount, type, orderId, walletPhone } = req.body;
  if (!amount || Number(amount) <= 0) throw new ApiError(400, 'Valid amount is required');
  if (kind === 'wallet' && !walletPhone) throw new ApiError(400, 'walletPhone is required for Vodafone Cash');
  if (kind === 'wallet' && !/^01[0-25][0-9]{8}$/.test(walletPhone)) throw new ApiError(400, 'Invalid Egyptian phone number');

  const user = await User.findById(req.user.id);
  const amountCents = Math.round(Number(amount) * 100);
  const merchantOrderId = `QRB-${Date.now()}-${String(req.user.id).slice(-6)}`;
  const payload = {
    amountCents,
    merchantOrderId,
    description: type === 'deposit' ? 'Wallet Deposit' : 'Order Payment',
    billingData: billingOf(user),
    walletPhone
  };

  const payment = kind === 'card'
    ? await createCardPayment(payload)
    : kind === 'wallet'
      ? await createWalletPayment(payload)
      : await createInstapayPayment(payload);

  await Wallet.create({
    user: user._id,
    order: orderId || null,
    type: type === 'deposit' ? 'deposit' : 'payment',
    amount: Number(amount),
    status: 'pending',
    paymentMethod: kind === 'card' ? 'card' : kind === 'wallet' ? 'vodafone_cash' : 'instapay',
    paymobTransactionId: payment.paymobOrderId,
    description: type === 'deposit' ? `Wallet deposit via ${kind}` : 'Order payment',
    balanceAfter: user.walletBalance || 0
  });

  // NOTE: no instant credit — deposits are only added after real receipt.
  // Card/wallet/instapay complete via Paymob webhook (live mode);
  // manual InstaPay top-ups complete via admin approval (/admin/topups).
  // The mock order-escrow below exists only so API-level tests can proceed
  // without keys; the GUI never uses it (it uses /orders/:id/pay instead).

  // Dev-mock convenience: instant escrow hold for order card payments (simulates Paymob success callback)
  if (payment.mode === 'mock' && type !== 'deposit' && orderId) {
    const order = await Order.findById(orderId);
    if (order && String(order.patient) === String(req.user.id)) {
      order.paymentStatus = 'paid';
      order.escrowStatus = 'held';
      order.statusHistory.push({ status: order.status, changedBy: user._id, notes: 'Escrow held (mock payment)' });
      await order.save();
    }
  }

  ResponseHelper.success(res, {
    iframeUrl: payment.iframeUrl,
    redirectUrl: payment.redirectUrl,
    paymentKey: payment.paymentKey,
    paymobOrderId: payment.paymobOrderId,
    merchantOrderId,
    mode: payment.mode
  }, kind === 'wallet' ? 'Vodafone Cash payment initiated. Check your phone for OTP.' : 'Payment initiated');
});

// Paymob server-to-server callback: marks escrow HELD on success
const webhook = asyncHandler(async (req, res) => {
  const transaction = req.body.obj || req.body.transaction || req.body;
  if (!transaction) throw new ApiError(400, 'Invalid webhook data');
  const paymobId = String((transaction.order && transaction.order.id) || transaction.id || transaction.paymobOrderId || '');
  const tx = await Wallet.findOne({ paymobTransactionId: paymobId });
  if (!tx) throw new ApiError(404, 'Transaction not found');

  const success = transaction.success === true || transaction.success === 'true';
  if (success) {
    tx.status = 'completed';
    await tx.save();
    const user = await User.findById(tx.user);
    if (tx.type === 'deposit') {
      user.walletBalance = (user.walletBalance || 0) + tx.amount;
      await user.save();
      tx.balanceAfter = user.walletBalance;
      await tx.save();
    } else if (tx.type === 'payment' && tx.order) {
      const order = await Order.findById(tx.order);
      if (order) {
        order.paymentStatus = 'paid';
        order.escrowStatus = 'held';
        order.statusHistory.push({ status: order.status, changedBy: user._id, notes: 'Escrow held (Paymob)' });
        await order.save();
      }
    }
  } else {
    tx.status = 'failed';
    await tx.save();
  }
  ResponseHelper.success(res, { ok: true }, 'Webhook processed');
});

const successRedirect = asyncHandler(async (req, res) => {
  ResponseHelper.success(res, req.query, 'Payment completed successfully');
});

const failureRedirect = asyncHandler(async (req, res) => {
  ResponseHelper.success(res, req.query, 'Payment failed or cancelled');
});

// Owner receiving account: patients pay here directly (InstaPay).
// Number is configurable via OWNER_INSTAPAY_NUMBER in .env
const getOwnerAccount = asyncHandler(async (req, res) => {
  ResponseHelper.success(res, {
    instapay: process.env.OWNER_INSTAPAY_NUMBER || '01150209401',
    name: 'Qarrib'
  }, 'Owner payment account');
});

module.exports = {
  initiateCard: initiate('card'),
  initiateWallet: initiate('wallet'),
  initiateInstapay: initiate('instapay'),
  webhook,
  successRedirect,
  failureRedirect,
  getOwnerAccount
};
