const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const ResponseHelper = require('../utils/response');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Plans: free / pro (250 EGP/month) / vip (500 EGP/month) / nurse_vip (500 EGP/month).
// Perks grow with price: Free = try the app, Pro = regulars (matched first + 5%
// cashback), VIP = everything + 10% cashback + 24/7 hotline, VIP Nurse =
// trusted badge + top rank + withdrawals from 50 EGP.
// Yearly billing = 10x monthly (2 months free). Admin can change monthly
// prices from Admin → Subscriptions; yearly follows automatically unless
// overridden (pro_yearly / vip_yearly / nurse_vip_yearly).
const YEARLY_MONTHS_CHARGED = 10;
const DEFAULT_PLANS = {
  free: {
    id: 'free', name: 'Free', nameAr: 'مجانية', price: 0, durationDays: 30,
    tagline: 'Try Qarrib — request a nurse, track live, chat and pay per visit.',
    features: [
      'request_nurse', 'live_tracking', 'chat_basic', 'wallet_pay', 'rate_feedback',
      'calls_3_per_order', 'support_standard'
    ],
    limits: { callsPerOrder: 3, supportHours: '9am–5pm', priorityMatching: false, adminHotline24h: false, cashbackPercent: 0 }
  },
  pro: {
    id: 'pro', name: 'Pro', nameAr: 'احترافية', price: 250, durationDays: 30,
    tagline: 'For regulars — matched first, unlimited calls, 5% cashback on every visit.',
    features: [
      'request_nurse', 'live_tracking', 'chat_basic', 'wallet_pay', 'rate_feedback',
      'unlimited_calls', 'priority_matching', 'gallery_priority', 'support_priority',
      'cashback_5', 'support_extended', 'admin_chat'
    ],
    limits: { callsPerOrder: 'unlimited', supportHours: '8am–12am', priorityMatching: true, adminHotline24h: false, cashbackPercent: 5 }
  },
  vip: {
    id: 'vip', name: 'VIP', nameAr: 'مميزة', price: 500, durationDays: 30,
    tagline: 'The full Qarrib — 10% cashback everywhere, 24/7 hotline, a manager who knows you.',
    features: [
      'request_nurse', 'live_tracking', 'chat_basic', 'wallet_pay', 'rate_feedback',
      'unlimited_calls', 'priority_matching', 'gallery_priority', 'support_priority',
      'cashback_10', 'support_247', 'admin_hotline_24h', 'dedicated_manager',
      'free_reschedule', 'family_accounts', 'vip_badge', 'admin_chat', 'manager_chat'
    ],
    limits: { callsPerOrder: 'unlimited', supportHours: '24/7', priorityMatching: true, adminHotline24h: true, cashbackPercent: 10 }
  },
  // Nurse-only plans: Free Nurse (basic) vs VIP Nurse (500 EGP/month, trusted badge).
  // VIP nurses show ✅ trusted to patients, rank first, withdraw from 50 EGP.
  nurse_vip: {
    id: 'nurse_vip', name: 'VIP Nurse', nameAr: 'ممرض مميز', price: 500, durationDays: 30,
    role: 'nurse',
    tagline: 'Get chosen first — ✅ TRUSTED badge, top rank, more visits, withdrawals from 50 EGP.',
    features: [
      'accept_orders', 'live_tracking', 'chat_basic', 'wallet_view',
      'unlimited_calls', 'trusted_nurse', 'rank_first', 'vip_badge',
      'withdrawal_min_50', 'support_priority', 'support_247'
    ],
    limits: { callsPerOrder: 'unlimited', supportHours: '24/7', priorityMatching: true, adminHotline24h: false, minWithdrawal: 50 }
  }
};

// Admin-editable price overrides (in-memory + persisted via PermissionSettings-like doc)
let priceOverrides = {};
async function loadOverrides() {
  try {
    const mongoose = require('mongoose');
    const col = mongoose.connection.db.collection('appsettings');
    const doc = await col.findOne({ key: 'plans' });
    if (doc && doc.prices) priceOverrides = doc.prices;
  } catch (_) {}
}
async function saveOverrides() {
  try {
    const mongoose = require('mongoose');
    const col = mongoose.connection.db.collection('appsettings');
    await col.updateOne({ key: 'plans' }, { $set: { key: 'plans', prices: priceOverrides } }, { upsert: true });
  } catch (_) {}
}
loadOverrides().catch(() => {});

function getPlans() {
  const plans = JSON.parse(JSON.stringify(DEFAULT_PLANS));
  for (const k of Object.keys(priceOverrides)) {
    if (plans[k] && Number.isFinite(Number(priceOverrides[k]))) plans[k].price = Number(priceOverrides[k]);
  }
  // Yearly billing: pay 10 months, get 12 (2 months free), unless overridden.
  for (const k of ['pro', 'vip', 'nurse_vip']) {
    const yKey = `${k}_yearly`;
    const yearly = priceOverrides[yKey] != null && Number.isFinite(Number(priceOverrides[yKey]))
      ? Number(priceOverrides[yKey])
      : plans[k].price * YEARLY_MONTHS_CHARGED;
    plans[k].yearlyPrice = yearly;
    plans[k].yearlyMonthsCharged = YEARLY_MONTHS_CHARGED;
    plans[k].yearlySave = Math.max(0, plans[k].price * 12 - yearly);
  }
  return plans;
}

function priceFor(planId, billing) {
  const plans = getPlans();
  const p = plans[planId];
  if (!p) return null;
  if (billing === 'yearly') return { price: p.yearlyPrice, durationDays: 365 };
  return { price: p.price, durationDays: p.durationDays || 30 };
}

function planOf(user) {
  const sub = user.subscription || {};
  let plan = sub.plan || 'free';
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date() && plan !== 'free') plan = 'free';
  return plan;
}

function hasFeature(user, feature) {
  const plan = planOf(user);
  const plans = getPlans();
  return ((plans[plan] && plans[plan].features) || []).includes(feature);
}

// Trusted nurse = active VIP Nurse plan. Shown with ✅ to patients, sorted first.
function isTrustedNurse(nurseDoc) {
  try {
    const sub = (nurseDoc && (nurseDoc.subscription || (nurseDoc.toObject && nurseDoc.toObject().subscription))) || {};
    if (sub.plan !== 'nurse_vip') return false;
    if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) return false;
    return true;
  } catch (_) { return false; }
}

const ownerInstaPay = () => process.env.OWNER_INSTAPAY_NUMBER || '01150209401';
const ownerVfCash = () => process.env.OWNER_VF_CASH_NUMBER || '01003790634';

async function refreshUserPlan(user) {
  const sub = user.subscription || {};
  if (sub.plan && sub.plan !== 'free' && sub.expiresAt && new Date(sub.expiresAt) < new Date()) {
    user.subscription.plan = 'free';
    user.subscription.status = 'expired';
    await user.save();
    await Subscription.updateMany({ user: user._id, status: 'active' }, { $set: { status: 'expired' } });
  }
  return user;
}

// GET /api/subscriptions/plans — role-aware list + the InstaPay number to pay to
const listPlans = asyncHandler(async (req, res) => {
  const plans = getPlans();
  let mine = 'free';
  let role = req.user.role;
  try {
    const me = await User.findById(req.user.id);
    await refreshUserPlan(me);
    mine = planOf(me);
    role = me.role;
  } catch (_) {}
  const list = role === 'nurse'
    ? [plans.free, plans.nurse_vip]
    : role === 'admin'
      ? [plans.free, plans.pro, plans.vip, plans.nurse_vip]
      : [plans.free, plans.pro, plans.vip];
  ResponseHelper.success(res, { plans: list, myPlan: mine, myRole: role, ownerInstaPay: ownerInstaPay(), ownerVfCash: ownerVfCash() }, 'Subscription plans');
});

// GET /api/subscriptions/me
const mySubscription = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id);
  await refreshUserPlan(me);
  const plans = getPlans();
  const plan = planOf(me);
  const active = await Subscription.findOne({ user: me._id, status: 'active' }).sort({ endsAt: -1 });
  ResponseHelper.success(res, {
    plan, planDef: plans[plan] || plans.free,
    expiresAt: me.subscription?.expiresAt || null,
    status: me.subscription?.status || 'active',
    features: (plans[plan] || plans.free).features,
    isTrusted: isTrustedNurse(me),
    ownerInstaPay: ownerInstaPay(),
    active
  }, 'My subscription');
});

// POST /api/subscriptions/subscribe {plan: pro|vip, method: wallet|instapay, reference?}
const subscribe = asyncHandler(async (req, res) => {
  const { plan, method, reference, billing } = req.body;
  if (!['pro', 'vip', 'nurse_vip'].includes(plan)) throw new ApiError(400, 'plan must be pro, vip or nurse_vip');
  if (!['wallet', 'instapay', 'vodafone_cash'].includes(method)) throw new ApiError(400, 'method must be wallet, instapay or vodafone_cash');
  const cycle = billing === 'yearly' ? 'yearly' : 'monthly';
  const priced = priceFor(plan, cycle);
  if (!priced) throw new ApiError(400, 'Unknown plan');
  const price = priced.price;
  const days = priced.durationDays;
  const cycleLabel = cycle === 'yearly' ? 'سنة (365 يوم)' : 'شهر (30 يوم)';
  const me = await User.findById(req.user.id);
  await refreshUserPlan(me);
  // Plans are role-locked: nurse_vip is nurses-only, pro/vip are patients-only
  if (me.role === 'nurse' && plan !== 'nurse_vip') throw new ApiError(400, 'Nurses can only subscribe to VIP Nurse');
  if (me.role === 'patient' && plan === 'nurse_vip') throw new ApiError(400, 'VIP Nurse is for nurses only');
  const plans = getPlans();

  if (method === 'wallet') {
    if ((me.walletBalance || 0) < price) throw new ApiError(400, `Insufficient wallet balance — ${plan.toUpperCase()} ${cycle} costs ${price} EGP. Top up first.`);
    me.walletBalance = (me.walletBalance || 0) - price;
    await me.save();
    await Wallet.create({
      user: me._id, type: 'subscription', amount: price, status: 'completed',
      paymentMethod: 'wallet', description: `Subscription ${plan.toUpperCase()} ${cycle} — ${days} days`, balanceAfter: me.walletBalance
    });
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + days * 24 * 3600 * 1000);
    me.subscription = { plan, status: 'active', startedAt: startsAt, expiresAt: endsAt };
    await me.save();
    const sub = await Subscription.create({ user: me._id, plan, price, billing: cycle, durationDays: days, status: 'active', paymentMethod: 'wallet', startsAt, endsAt });
    const welcomeMsg = plan === 'nurse_vip'
      ? 'Your VIP NURSE plan is active for 30 days — patients now see you as ✅ TRUSTED and you rank first.'
      : `Your ${plan.toUpperCase()} plan is active for 30 days — enjoy ${plan === 'vip' ? 'all features + 24/7 admin hotline' : 'priority matching, unlimited calls & priority support'}.`;
    await Notification.create({ recipient: me._id, title: `Welcome to ${plan.toUpperCase()} 🎉`, message: welcomeMsg, type: 'payment', data: { subscriptionId: sub._id, plan } });
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const a of admins) {
      await Notification.create({ recipient: a._id, title: 'New subscription', message: `${me.fullName} subscribed to ${plan.toUpperCase()} (${price} EGP via wallet)`, type: 'payment', data: { subscriptionId: sub._id, userId: me._id, plan } });
    }
    try {
      const { emitToUser } = require('../sockets');
      emitToUser(String(me._id), 'notification', { title: `Welcome to ${plan.toUpperCase()}`, plan });
    } catch (_) {}
    return ResponseHelper.success(res, { plan, expiresAt: endsAt, price, billing: cycle }, `Subscribed to ${plan.toUpperCase()} ${cycle} — active for ${days} days`);
  }

  // instapay / vodafone_cash: pending until admin approves (user transferred to owner account)
  const methodLabel = method === 'vodafone_cash' ? 'Vodafone Cash' : 'InstaPay';
  const ownerNumber = method === 'vodafone_cash' ? ownerVfCash() : ownerInstaPay();
  const sub = await Subscription.create({
    user: me._id, plan, price, billing: cycle, durationDays: days, status: 'pending', paymentMethod: method,
    reference: (reference || '').trim() || null
  });
  me.subscription = { plan: me.subscription?.plan || 'free', status: me.subscription?.plan && me.subscription.plan !== 'free' ? me.subscription.status : 'active', startedAt: me.subscription?.startedAt || null, expiresAt: me.subscription?.expiresAt || null };
  await me.save();
  await Notification.create({ recipient: me._id, title: 'Subscription request received', message: `We received your ${plan.toUpperCase()} request (${price} EGP via ${methodLabel}) — admin will activate it after verifying the transfer.`, type: 'payment', data: { subscriptionId: sub._id, plan } });
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const a of admins) {
    await Notification.create({ recipient: a._id, title: 'New subscription to review', message: `${me.fullName} requested ${plan.toUpperCase()} (${price} EGP, ${methodLabel} ref: ${(reference || '').trim() || '—'})`, type: 'payment', data: { subscriptionId: sub._id, userId: me._id, plan } });
  }
  try {
    const { emitToUser } = require('../sockets');
    admins.forEach((x) => emitToUser(String(x._id), 'notification', { title: 'New subscription to review', plan }));
  } catch (_) {}
  ResponseHelper.success(res, { plan, price, status: 'pending', subscriptionId: sub._id, billing: cycle, ownerInstaPay: ownerInstaPay(), ownerVfCash: ownerVfCash() }, `Request sent — transfer ${price} EGP (${cycleLabel}) via ${methodLabel} to ${ownerNumber}, then admin activates your plan after verifying`);
});

// POST /api/subscriptions/cancel
const cancel = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id);
  me.subscription = { plan: 'free', status: 'active', startedAt: null, expiresAt: null };
  await me.save();
  await Subscription.updateMany({ user: me._id, status: { $in: ['active', 'pending'] } }, { $set: { status: 'cancelled' } });
  ResponseHelper.success(res, { plan: 'free' }, 'Subscription cancelled — back to Free');
});

// --- Admin ---
// GET /api/subscriptions/admin/all?status=
const adminList = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const q = {};
  if (status) q.status = status;
  const subs = await Subscription.find(q).populate('user', 'fullName email phone role').sort({ createdAt: -1 }).limit(100).lean();
  ResponseHelper.success(res, subs.map((s) => ({
    id: String(s._id), plan: s.plan, price: s.price, billing: s.billing || 'monthly', durationDays: s.durationDays || 30, status: s.status,
    paymentMethod: s.paymentMethod, reference: s.reference || null,
    startsAt: s.startsAt, endsAt: s.endsAt, createdAt: s.createdAt,
    user: s.user ? { id: String(s.user._id), name: s.user.fullName, email: s.user.email, phone: s.user.phone, role: s.user.role } : null
  })), 'Subscriptions');
});

// POST /api/subscriptions/admin/:id {action: approve|reject}
const adminReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const raw = req.body.action || req.body.status;
  const approve = raw === 'approve' || raw === 'approved';
  const sub = await Subscription.findById(id);
  if (!sub) throw new ApiError(404, 'Subscription not found');
  if (sub.status !== 'pending') throw new ApiError(400, 'Already reviewed');
  const user = await User.findById(sub.user);
  if (approve) {
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + (sub.durationDays || 30) * 24 * 3600 * 1000);
    const daysLabel = (sub.durationDays || 30) >= 365 ? 'سنة (365 يوم)' : `${sub.durationDays || 30} يوم`;
    sub.status = 'active'; sub.startsAt = startsAt; sub.endsAt = endsAt;
    sub.reviewedBy = req.user.id; sub.reviewedAt = new Date();
    await sub.save();
    user.subscription = { plan: sub.plan, status: 'active', startedAt: startsAt, expiresAt: endsAt };
    await user.save();
    await Wallet.create({ user: user._id, type: 'subscription', amount: sub.price, status: 'completed', paymentMethod: sub.paymentMethod || 'instapay', reference: sub.reference, description: `Subscription ${sub.plan.toUpperCase()} approved — ${daysLabel}`, balanceAfter: user.walletBalance || 0 });
    await Notification.create({ recipient: user._id, title: `Your ${sub.plan.toUpperCase()} is active 🎉`, message: `Admin activated your ${sub.plan.toUpperCase()} plan for 30 days${sub.plan === 'vip' ? ' — 24/7 admin hotline is now available in your dashboard' : sub.plan === 'nurse_vip' ? ' — patients now see you as ✅ TRUSTED' : ''}.`, type: 'payment', data: { subscriptionId: sub._id, plan: sub.plan } });
    try { const { emitToUser } = require('../sockets'); emitToUser(String(user._id), 'notification', { title: `Your ${sub.plan.toUpperCase()} is active`, plan: sub.plan }); } catch (_) {}
  } else {
    sub.status = 'rejected'; sub.reviewedBy = req.user.id; sub.reviewedAt = new Date();
    await sub.save();
    await Notification.create({ recipient: user._id, title: 'Subscription rejected', message: `Your ${sub.plan.toUpperCase()} request was rejected — contact support.`, type: 'payment', data: { subscriptionId: sub._id } });
  }
  ResponseHelper.success(res, { id: String(sub._id), status: sub.status }, approve ? 'Subscription activated' : 'Subscription rejected');
});

// POST /api/subscriptions/admin/user/:userId/remove — admin removes ANY user
// from their paid plan (back to Free). Notifies the user. Audited.
const adminRemove = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  const oldPlan = (user.subscription && user.subscription.plan) || 'free';
  if (oldPlan === 'free') throw new ApiError(400, 'User is already on the Free plan');
  user.subscription = { plan: 'free', status: 'active', startedAt: null, expiresAt: null };
  await user.save();
  await Subscription.updateMany({ user: user._id, status: { $in: ['active', 'pending'] } }, { $set: { status: 'cancelled' } });
  await Notification.create({ recipient: user._id, title: 'تم إلغاء اشتراكك', message: `ألغت الإدارة اشتراكك في خطة ${oldPlan.toUpperCase()} — عدت للخطة المجانية`, type: 'payment', data: { plan: oldPlan } });
  try { require('../utils/audit').logAdmin(req, 'user.toggle', { targetType: 'subscription', targetId: String(userId), details: `${user.fullName} removed from ${oldPlan} -> free` }); } catch (_) {}
  ResponseHelper.success(res, { userId: String(user._id), plan: 'free' }, 'تمت إزالة المستخدم من الخطة — عاد للمجانية');
});

// PUT /api/subscriptions/admin/prices {pro?, vip?, nurse_vip?, pro_yearly?, vip_yearly?, nurse_vip_yearly?}
const adminPrices = asyncHandler(async (req, res) => {
  for (const k of ['pro', 'vip', 'nurse_vip', 'pro_yearly', 'vip_yearly', 'nurse_vip_yearly']) {
    if (req.body[k] != null) {
      const p = Number(req.body[k]);
      if (!Number.isFinite(p) || p < 0) throw new ApiError(400, `Invalid ${k} price`);
      priceOverrides[k] = p;
    }
  }
  await saveOverrides();
  ResponseHelper.success(res, { plans: getPlans() }, 'Plan prices updated');
});

// Visit cashback (REAL plan perk): Pro 5% / VIP 10% of the visit price back to
// the patient wallet on every completed visit. Never throws.
async function grantVisitCashback(order) {
  try {
    const base = Number(order && order.finalPrice) || 0;
    if (!order || !base) return 0;
    const patientDoc = await User.findById(order.patient);
    const pPlan = patientDoc ? planOf(patientDoc) : 'free';
    const rate = pPlan === 'vip' ? 0.10 : pPlan === 'pro' ? 0.05 : 0;
    if (!rate) return 0;
    const back = Math.round(base * rate * 100) / 100;
    patientDoc.walletBalance = (patientDoc.walletBalance || 0) + back;
    await patientDoc.save();
    await Wallet.create({
      user: patientDoc._id, order: order._id, type: 'refund', amount: back, status: 'completed',
      description: `${pPlan.toUpperCase()} cashback ${Math.round(rate * 100)}% for order ${order.orderNumber}`,
      balanceAfter: patientDoc.walletBalance
    });
    await Notification.create({
      recipient: patientDoc._id, title: 'كاش باك 💰',
      message: `رجع لك ${back} ج.م كاش باك (${Math.round(rate * 100)}%) من اشتراك ${pPlan.toUpperCase()} على الطلب #${order.orderNumber}`,
      type: 'payment', data: { orderId: order._id }
    });
    return back;
  } catch (_) { return 0; }
}

module.exports = { listPlans, mySubscription, subscribe, cancel, adminList, adminReview, adminRemove, adminPrices, getPlans, planOf, hasFeature, refreshUserPlan, isTrustedNurse, ownerInstaPay, ownerVfCash, grantVisitCashback, DEFAULT_PLANS };
