const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Notification = require('../models/Notification');
const ResponseHelper = require('../utils/response');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const { emitToUser } = require('../sockets');

const getWallet = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const transactions = await Wallet.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(50);
  ResponseHelper.success(res, {
    balance: user.walletBalance || 0,
    transactions: transactions.map((t) => ({
      id: t._id,
      type: t.type,
      amount: t.amount,
      status: t.status,
      paymentMethod: t.paymentMethod,
      description: t.description,
      createdAt: t.createdAt,
      balanceAfter: t.balanceAfter
    }))
  }, 'Wallet');
});

const getTransaction = asyncHandler(async (req, res) => {
  const tx = await Wallet.findOne({ _id: req.params.id, user: req.user.id });
  if (!tx) throw new ApiError(404, 'Transaction not found');
  ResponseHelper.success(res, tx, 'Transaction details');
});

// Nurse-only payout request (manual bank transfer in v1)
const requestWithdrawal = asyncHandler(async (req, res) => {
  const { amount, method, accountDetails, payoutAccount } = req.body;
  if (req.user.role !== 'nurse') throw new ApiError(403, 'Only nurses can withdraw earnings');
  if (!amount || Number(amount) <= 0) throw new ApiError(400, 'Valid amount is required');
  const user = await User.findById(req.user.id);
  if ((user.walletBalance || 0) < Number(amount)) {
    throw new ApiError(400, 'Insufficient balance');
  }
  // Save / update the nurse payout account so admin knows where to send money
  const payout = (payoutAccount || accountDetails || user.payoutAccount || '').trim();
  if (payout) {
    user.payoutAccount = payout;
    if (method) user.payoutMethod = method;
    await user.save();
  }
  user.walletBalance = (user.walletBalance || 0) - Number(amount);
  await user.save();
  const tx = await Wallet.create({
    user: user._id,
    type: 'withdrawal',
    amount: Number(amount),
    status: 'pending',
    paymentMethod: method || 'bank_transfer',
    description: `Withdrawal request - ${method || 'bank transfer'} -> ${payout || accountDetails || ''}`.trim(),
    balanceAfter: user.walletBalance
  });
  // Notify all admins with nurse payout info
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const a of admins) {
    await Notification.create({
      recipient: a._id,
      title: 'طلب سحب جديد',
      message: `الممرض ${user.fullName} طلب سحب ${Number(amount)} ج.م إلى (${payout || 'بدون رقم'})`,
      type: 'payment',
      data: { withdrawalId: tx._id, nurseId: user._id, amount: Number(amount), payoutAccount: payout || null }
    });
  }
  try {
    const { emitToUser } = require('../sockets');
    admins.forEach((a) => emitToUser(String(a._id), 'notification', { title: 'طلب سحب جديد', withdrawalId: tx._id, amount: Number(amount) }));
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, tx, 'Withdrawal request submitted. It will be processed within 24-48 hours.');
});

// Patient top-up: "no balance until purchase" — user transfers via InstaPay
// to the owner account, then submits amount + reference for admin approval.
const topupRequest = asyncHandler(async (req, res) => {
  const { amount, reference } = req.body;
  if (!amount || Number(amount) < 10) throw new ApiError(400, 'Minimum top-up is 10 EGP');
  const user = await User.findById(req.user.id);
  const tx = await Wallet.create({
    user: user._id,
    type: 'deposit',
    amount: Number(amount),
    status: 'pending',
    paymentMethod: 'instapay',
    reference: (reference || '').trim() || null,
    description: `Wallet top-up request (InstaPay)${reference ? ' ref: ' + reference.trim() : ''}`,
    balanceAfter: user.walletBalance || 0
  });
  // Notify admins to review + add balance (owner InstaPay number flow)
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const a of admins) {
    await Notification.create({
      recipient: a._id,
      title: 'طلب شحن محفظة',
      message: `${user.fullName} طلب شحن ${Number(amount)} ج.م (مرجع: ${(reference || '').trim() || '—'})`,
      type: 'payment',
      data: { topupId: tx._id, userId: user._id, amount: Number(amount), reference: (reference || '').trim() || null }
    });
  }
  try {
    const { emitToUser } = require('../sockets');
    admins.forEach((a) => emitToUser(String(a._id), 'notification', { title: 'طلب شحن محفظة', topupId: tx._id, amount: Number(amount) }));
  } catch (_) { /* sockets optional */ }
  ResponseHelper.success(res, tx, 'تم إرسال طلب الشحن، سيتم إضافة الرصيد بعد تأكيد الإدارة');
});

// Patient transfers wallet balance to a nurse
const transferBalance = asyncHandler(async (req, res) => {
  const { nurseId, orderId, amount } = req.body;
  if (!nurseId) throw new ApiError(400, 'nurseId is required');
  const patient = await User.findById(req.user.id);
  const transferAmount = Number(amount || patient.walletBalance || 0);
  if (transferAmount <= 0) throw new ApiError(400, 'Valid amount is required');
  if ((patient.walletBalance || 0) < transferAmount) throw new ApiError(400, 'Insufficient wallet balance');

  const nurse = await User.findById(nurseId);
  if (!nurse || nurse.role !== 'nurse') throw new ApiError(404, 'Nurse not found');

  // Deduct from patient
  patient.walletBalance = (patient.walletBalance || 0) - transferAmount;
  await patient.save();

  // Add to nurse
  nurse.walletBalance = (nurse.walletBalance || 0) + transferAmount;
  await nurse.save();

  // Patient transaction
  await Wallet.create({
    user: patient._id,
    order: orderId || null,
    type: 'transfer',
    amount: transferAmount,
    status: 'completed',
    paymentMethod: 'wallet',
    description: `Transferred ${transferAmount} EGP to nurse ${nurse.fullName}${orderId ? ' (order ' + orderId + ')' : ''}`,
    balanceAfter: patient.walletBalance
  });

  // Nurse transaction
  await Wallet.create({
    user: nurse._id,
    order: orderId || null,
    type: 'transfer',
    amount: transferAmount,
    status: 'completed',
    paymentMethod: 'wallet',
    description: `Received ${transferAmount} EGP from patient ${patient.fullName}${orderId ? ' (order ' + orderId + ')' : ''}`,
    balanceAfter: nurse.walletBalance
  });

  // Notify nurse
  await Notification.create({
    recipient: nurse._id,
    title: 'استلام أموال',
    message: `المريض ${patient.fullName} أرسل ${transferAmount} ج.م إلى محفظتك`,
    type: 'payment',
    data: { transferAmount, patientId: patient._id, orderId }
  });

  try { emitToUser(String(nurse._id), 'notification', { title: 'استلام أموال', amount: transferAmount, patientId: patient._id }); } catch (_) {}

  ResponseHelper.success(res, {
    patientBalance: patient.walletBalance,
    nurseBalance: nurse.walletBalance,
    amount: transferAmount,
    nurse: { id: nurse._id, name: nurse.fullName, gender: nurse.gender }
  }, 'تم إرسال المبلغ للممرضة بنجاح');
});

// Nurse: see incoming transfers/payments
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

module.exports = { getWallet, getTransaction, requestWithdrawal, topupRequest, transferBalance, nurseTransfers };
