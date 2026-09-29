const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const ResponseHelper = require('../utils/response');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Plans: free / pro (250 EGP/month) / vip (500 EGP/month).
// VIP = every feature + 24/7 admin hotline. Pro = about half (priority set).
// Admin can change prices from Admin → Subscriptions (stored on the model statics).
const DEFAULT_PLANS = {
  free: {
    id: 'free', name: 'Free', nameAr: 'مجانية', price: 0, durationDays: 30,
    tagline: 'Try Qarrib — request a nurse, track, chat and pay.',
    features: [
      'request_nurse', 'live_tracking', 'chat_basic', 'wallet_pay', 'rate_feedback'
    ],
    limits: { callsPerOrder: 3, supportHours: '9am–5pm', priorityMatching: false, adminHotline24h: false }
  },
  pro: {
    id: 'pro', name: 'Pro', nameAr: 'احترافية', price: 250, durationDays: 30,
    tagline: 'Half of the premium features — for regular users.',
    features: [
      'request_nurse', 'live_tracking', 'chat_basic', 'wallet_pay', 'rate_feedback',
      'unlimited_calls', 'priority_matching', 'gallery_priority', 'support_priority', 'discount_5'
    ],
    limits: { callsPerOrder: 'unlimited', supportHours: '8am–12am', priorityMatching: true, adminHotline24h: false }
  },
  vip: {
    id: 'vip', name: 'VIP', nameAr: 'مميزة', price: 500, durationDays: 30,
    tagline: 'All features + 24/7 admin hotline calling.',
    features: [
      'request_nurse', 'live_tracking', 'chat_basic', 'wallet_pay', 'rate_feedback',
      'unlimited_calls', 'priority_matching', 'gallery_priority', 'support_priority', 'discount_5',
      'admin_hotline_24h', 'dedicated_manager', 'free_reschedule', 'withdrawal_priority', 'vip_badge', 'discount_10'
    ],
    limits: { callsPerOrder: 'unlimited', supportHours: '24/7', priorityMatching: true, adminHotline24h: true }
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
  return plans;
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
  return (plans[plan].features || []).includes(feature);
}

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

// GET /api/subscriptions/plans
const listPlans = asyncHandler(async (req, res) => {
  const plans = getPlans();
  let mine = 'free';
  try {
    const me = await User.findById(req.user.id);
    await refreshUserPlan(me);
    mine = planOf(me);
  } catch (_) {}
  ResponseHelper.success(res, { plans: [plans.free, plans.pro, plans.vip], myPlan: mine }, 'Subscription plans');
});

// GET /api/subscriptions/me
const mySubscription = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id);
  await refreshUserPlan(me);
  const plans = getPlans();
  const plan = planOf(me);
  const active = await Subscription.findOne({ user: me._id, status: 'active' }).sort({ endsAt: -1 });
  ResponseHelper.success(res, {
    plan, planDef: plans[plan],
    expiresAt: me.subscription?.expiresAt || null,
    status: me.subscription?.status || 'active',
    features: plans[plan].features,
    active
  }, 'My subscription');
});

// POST /api/subscriptions/subscribe {plan: pro|vip, method: wallet|instapay, reference?}
const subscribe = asyncHandler(async (req, res) => {
  const { plan, method, reference } = req.body;
  if (!['pro', 'vip'].includes(plan)) throw new ApiError(400, 'plan must be pro or vip');
  if (!['wallet', 'instapay'].includes(method)) throw new ApiError(400, 'method must be wallet or instapay');
  const plans = getPlans();
  const price = plans[plan].price;
  const me = await User.findById(req.user.id);
  await refreshUserPlan(me);

  if (method === 'wallet') {
    if ((me.walletBalance || 0) < price) throw new ApiError(400, `Insufficient wallet balance — ${plan.toUpperCase()} costs ${price} EGP. Top up first.`);
    me.walletBalance = (me.walletBalance || 0) - price;
    await me.save();
    await Wallet.create({
      user: me._id, type: 'subscription', amount: price, status: 'completed',
      paymentMethod: 'wallet', description: `Subscription ${plan.toUpperCase()} — 30 days`, balanceAfter: me.walletBalance
    });
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + 30 * 24 * 3600 * 1000);
    me.subscription = { plan, status: 'active', startedAt: startsAt, expiresAt: endsAt };
    await me.save();
    const sub = await Subscription.create({ user: me._id, plan, price, status: 'active', paymentMethod: 'wallet', startsAt, endsAt });
    await Notification.create({ recipient: me._id, title: `Welcome to ${plan.toUpperCase()} 🎉`, message: `Your ${plan.toUpperCase()} plan is active for 30 days — enjoy ${plan === 'vip' ? 'all features + 24/7 admin hotline' : 'priority matching, unlimited calls & priority support'}.`, type: 'payment', data: { subscriptionId: sub._id, plan } });
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const a of admins) {
      await Notification.create({ recipient: a._id, title: 'New subscription', message: `${me.fullName} subscribed to ${plan.toUpperCase()} (${price} EGP via wallet)`, type: 'payment', data: { subscriptionId: sub._id, userId: me._id, plan } });
    }
    try {
      const { emitToUser } = require('../sockets');
      emitToUser(String(me._id), 'notification', { title: `Welcome to ${plan.toUpperCase()}`, plan });
    } catch (_) {}
    return ResponseHelper.success(res, { plan, expiresAt: endsAt, price }, `Subscribed to ${plan.toUpperCase()} — active for 30 days`);
  }

  // instapay: pending until admin approves (user transferred to owner account)
  const sub = await Subscription.create({
    user: me._id, plan, price, status: 'pending', paymentMethod: 'instapay',
    reference: (reference || '').trim() || null
  });
  me.subscription = { plan: me.subscription?.plan || 'free', status: me.subscription?.plan && me.subscription.plan !== 'free' ? me.subscription.status : 'active', startedAt: me.subscription?.startedAt || null, expiresAt: me.subscription?.expiresAt || null };
  await me.save();
  await Notification.create({ recipient: me._id, title: 'Subscription request received', message: `We received your ${plan.toUpperCase()} request (${price} EGP via InstaPay) — admin will activate it after verifying the transfer.`, type: 'payment', data: { subscriptionId: sub._id, plan } });
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const a of admins) {
    await Notification.create({ recipient: a._id, title: 'New subscription to review', message: `${me.fullName} requested ${plan.toUpperCase()} (${price} EGP, InstaPay ref: ${(reference || '').trim() || '—'})`, type: 'payment', data: { subscriptionId: sub._id, userId: me._id, plan } });
  }
  try {
    const { emitToUser } = require('../sockets');
    admins.forEach((x) => emitToUser(String(x._id), 'notification', { title: 'New subscription to review', plan }));
  } catch (_) {}
  ResponseHelper.success(res, { plan, price, status: 'pending', subscriptionId: sub._id }, 'Request sent — admin will activate your plan after verifying the transfer');
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
    id: String(s._id), plan: s.plan, price: s.price, status: s.status,
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
    sub.status = 'active'; sub.startsAt = startsAt; sub.endsAt = endsAt;
    sub.reviewedBy = req.user.id; sub.reviewedAt = new Date();
    await sub.save();
    user.subscription = { plan: sub.plan, status: 'active', startedAt: startsAt, expiresAt: endsAt };
    await user.save();
    await Wallet.create({ user: user._id, type: 'subscription', amount: sub.price, status: 'completed', paymentMethod: sub.paymentMethod || 'instapay', reference: sub.reference, description: `Subscription ${sub.plan.toUpperCase()} approved — 30 days`, balanceAfter: user.walletBalance || 0 });
    await Notification.create({ recipient: user._id, title: `Your ${sub.plan.toUpperCase()} is active 🎉`, message: `Admin activated your ${sub.plan.toUpperCase()} plan for 30 days${sub.plan === 'vip' ? ' — 24/7 admin hotline is now available in your dashboard' : ''}.`, type: 'payment', data: { subscriptionId: sub._id, plan: sub.plan } });
    try { const { emitToUser } = require('../sockets'); emitToUser(String(user._id), 'notification', { title: `Your ${sub.plan.toUpperCase()} is active`, plan: sub.plan }); } catch (_) {}
  } else {
    sub.status = 'rejected'; sub.reviewedBy = req.user.id; sub.reviewedAt = new Date();
    await sub.save();
    await Notification.create({ recipient: user._id, title: 'Subscription rejected', message: `Your ${sub.plan.toUpperCase()} request was rejected — contact support.`, type: 'payment', data: { subscriptionId: sub._id } });
  }
  ResponseHelper.success(res, { id: String(sub._id), status: sub.status }, approve ? 'Subscription activated' : 'Subscription rejected');
});

// PUT /api/subscriptions/admin/prices {pro?, vip?}
const adminPrices = asyncHandler(async (req, res) => {
  if (req.body.pro != null) {
    const p = Number(req.body.pro);
    if (!Number.isFinite(p) || p < 0) throw new ApiError(400, 'Invalid pro price');
    priceOverrides.pro = p;
  }
  if (req.body.vip != null) {
    const p = Number(req.body.vip);
    if (!Number.isFinite(p) || p < 0) throw new ApiError(400, 'Invalid vip price');
    priceOverrides.vip = p;
  }
  await saveOverrides();
  ResponseHelper.success(res, { plans: getPlans() }, 'Plan prices updated');
});

module.exports = { listPlans, mySubscription, subscribe, cancel, adminList, adminReview, adminPrices, getPlans, planOf, hasFeature, refreshUserPlan, DEFAULT_PLANS };
