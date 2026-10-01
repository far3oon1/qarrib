// Admin-only: admin accounts CRUD + device/IP blocklist.
// All routes are mounted under /api/admin with protect+authorize('admin'),
// so helpers/assistants can NEVER reach them.
const User = require('../models/User');
const Device = require('../models/Device');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { getDeviceMeta } = require('../utils/device');
const { logAdmin, ACTIONS } = require('../utils/audit');

// ---------- ADMIN ACCOUNTS ----------
// GET /admin/admins — list every admin (admin panel only)
const listAdmins = asyncHandler(async (req, res) => {
  const admins = await User.find({ role: 'admin' }).select('-password').sort({ createdAt: -1 }).lean();
  ResponseHelper.success(res, admins.map((a) => ({
    id: String(a._id), fullName: a.fullName, email: a.email, phone: a.phone,
    isActive: a.isActive, status: a.status, lastLogin: a.lastLogin || null,
    createdAt: a.createdAt, isSelf: String(a._id) === String(req.user.id),
  })), 'Admin accounts');
});

// POST /admin/admins — create a new admin (admin panel only)
const createAdmin = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password } = req.body || {};
  if (!fullName || !email || !password) throw new ApiError(400, 'fullName, email and password are required');
  if (String(password).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
  const cleanPhone = (phone || '').toString().trim() || `01${String(Date.now()).slice(-9)}`;
  const clash = await User.findOne({ $or: [{ email }, { phone: cleanPhone }] });
  if (clash) {
    if (clash.email === email) throw new ApiError(409, 'Email already registered');
    throw new ApiError(409, 'Phone already registered');
  }
  const admin = await User.create({
    fullName, email, phone: cleanPhone, password,
    nationalId: `${String(Date.now()).slice(-14)}`.padStart(14, '0').slice(0, 14),
    role: 'admin', status: 'active', isActive: true, createdBy: req.user.id,
  });
  ResponseHelper.success(res, {
    admin: { id: String(admin._id), fullName: admin.fullName, email: admin.email, phone: admin.phone },
  }, 'تم إنشاء حساب الأدمن بنجاح', 201);
  logAdmin(req, 'admin.create', { targetType: 'admin', targetId: String(admin._id), details: `${fullName} (${email})` });
});

// DELETE /admin/admins/:id — remove an admin (cannot remove self / last admin)
const deleteAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (String(id) === String(req.user.id)) throw new ApiError(400, 'لا يمكنك حذف حسابك نفسه وأنت مسجل به');
  const target = await User.findOne({ _id: id, role: 'admin' });
  if (!target) throw new ApiError(404, 'Admin not found');
  const count = await User.countDocuments({ role: 'admin' });
  if (count <= 1) throw new ApiError(400, 'لا يمكن حذف آخر أدمن — أنشئ بديلاً أولاً');
  await User.findByIdAndDelete(id);
  logAdmin(req, 'admin.delete', { targetType: 'admin', targetId: String(id), details: `${target.fullName} (${target.email})` });
  ResponseHelper.success(res, { id }, 'تم حذف حساب الأدمن');
});

// PATCH /admin/admins/:id/status — enable/disable another admin
const toggleAdminStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (String(id) === String(req.user.id)) throw new ApiError(400, 'لا يمكنك تعطيل حسابك نفسه');
  const target = await User.findOne({ _id: id, role: 'admin' });
  if (!target) throw new ApiError(404, 'Admin not found');
  target.isActive = !target.isActive;
  await target.save();
  logAdmin(req, 'admin.toggle', { targetType: 'admin', targetId: String(id), details: `${target.fullName} -> isActive=${target.isActive}` });
  ResponseHelper.success(res, { id, isActive: target.isActive }, target.isActive ? 'تم تفعيل الأدمن' : 'تم تعطيل الأدمن');
});

// ---------- DEVICES ----------
// GET /admin/devices — every device seen at register/login + manual blocks
const listDevices = asyncHandler(async (req, res) => {
  const { search = '', blocked = '', page = 1, limit = 30 } = req.query;
  const q = {};
  if (blocked === 'true') q.blocked = true;
  if (blocked === 'false') q.blocked = false;
  if (search) {
    const rx = new RegExp(search.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ deviceId: rx }, { email: rx }, { phone: rx }, { ip: rx }, { fingerprint: rx }, { userAgent: rx }];
  }
  const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(100, Math.max(1, parseInt(limit)));
  const lim = Math.min(100, Math.max(1, parseInt(limit)));
  const [rows, total] = await Promise.all([
    Device.find(q).populate('user', 'fullName email phone role').populate('blockedBy', 'fullName email').sort({ updatedAt: -1 }).skip(skip).limit(lim).lean(),
    Device.countDocuments(q),
  ]);
  ResponseHelper.success(res, {
    devices: rows.map((d) => ({
      id: String(d._id), deviceId: d.deviceId, fingerprint: d.fingerprint, ip: d.ip,
      platform: d.platform, userAgent: d.userAgent,
      user: d.user ? { id: String(d.user._id), name: d.user.fullName, email: d.user.email, phone: d.user.phone, role: d.user.role } : { name: d.email || d.phone || '—', email: d.email, phone: d.phone, role: d.role },
      firstSeenSource: d.firstSeenSource, loginCount: d.loginCount, lastSeen: d.lastSeen,
      blocked: !!d.blocked, blockReason: d.blockReason || null, blockedAt: d.blockedAt || null,
      blockedBy: d.blockedBy ? (d.blockedBy.fullName || d.blockedBy.email) : null,
      createdAt: d.createdAt, updatedAt: d.updatedAt,
    })),
    pagination: { page: parseInt(page), limit: lim, total },
    // Tell the panel what THIS admin's own device id looks like + how tracking works
    help: 'Browsers hide real MAC addresses — Qarrib tracks deviceId (auto-generated per browser) + IP + fingerprint. Block any of them below.',
  }, 'Devices');
});

// GET /admin/users/:userId/devices — devices used by one account (shown on Users page)
const getUserDevices = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const rows = await Device.find({ user: userId }).sort({ updatedAt: -1 }).limit(20).lean();
  ResponseHelper.success(res, rows.map((d) => ({
    id: String(d._id), deviceId: d.deviceId, fingerprint: d.fingerprint, ip: d.ip,
    platform: d.platform, userAgent: d.userAgent, blocked: !!d.blocked,
    blockReason: d.blockReason || null, lastSeen: d.lastSeen, loginCount: d.loginCount,
  })), 'User devices');
});

// POST /admin/devices/block { deviceId | ip | fingerprint | userId, reason }
const blockDevice = asyncHandler(async (req, res) => {
  const { deviceId, ip, fingerprint, userId, reason } = req.body || {};
  const cleanReason = (reason || '').toString().slice(0, 300) || 'Blocked by admin — rule violation';
  const targets = [];
  if (deviceId) targets.push(String(deviceId).trim());
  if (fingerprint) targets.push(`fp:${String(fingerprint).trim()}`);
  if (ip) targets.push(`ip:${String(ip).trim()}`);

  // Blocking by userId blocks ALL devices that user ever used (plus suspends account)
  let user = null;
  if (userId) {
    user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');
    if (user.role === 'admin') throw new ApiError(403, 'لا يمكن حظر جهاز أدمن — عطّل الحساب من صفحة الأدمنز');
    const owned = await Device.find({ user: userId });
    for (const d of owned) targets.push(d.deviceId);
  }
  if (!targets.length) throw new ApiError(400, 'deviceId, ip, fingerprint or userId is required');

  const meta = getDeviceMeta(req);
  const results = [];
  for (const key of [...new Set(targets)]) {
    const row = await Device.findOneAndUpdate(
      { deviceId: key },
      {
        $set: {
          blocked: true, blockReason: cleanReason, blockedAt: new Date(), blockedBy: req.user.id,
          ip: meta.ip, lastSeen: new Date(),
        },
        $setOnInsert: { userAgent: null, loginCount: 0, firstSeenSource: 'manual-block' },
      },
      { upsert: true, new: true }
    );
    results.push({ deviceId: row.deviceId, blocked: true });
    // Also flip the real device rows that share this deviceId
    await Device.updateMany({ deviceId: key, _id: { $ne: row._id } }, { $set: { blocked: true, blockReason: cleanReason, blockedAt: new Date(), blockedBy: req.user.id } });
  }

  // If a userId was given, suspend the account too so the token stops working
  if (user) {
    user.isActive = false;
    user.status = user.role === 'nurse' ? 'suspended' : user.status;
    await user.save();
    try {
      await Notification.create({ recipient: user._id, title: 'تم حظر جهازك/حسابك', message: `حظرت الإدارة جهازك: ${cleanReason}`, type: 'system' });
    } catch (_) {}
  }

  ResponseHelper.success(res, { blocked: results, reason: cleanReason, userSuspended: !!user }, 'تم الحظر — لن يستطيع هذا الجهاز تسجيل الدخول مجدداً');
  logAdmin(req, 'device.block', {
    targetType: user ? 'user' : 'device',
    targetId: user ? String(user._id) : results.map((x) => x.deviceId).join(','),
    details: `${results.map((x) => x.deviceId).join(',')} | reason: ${cleanReason}${user ? ` | account ${user.email} suspended` : ''}`,
  });
});

// POST /admin/devices/unblock { deviceId | ip | fingerprint | userId }
const unblockDevice = asyncHandler(async (req, res) => {
  const { deviceId, ip, fingerprint, userId } = req.body || {};
  const keys = [];
  if (deviceId) keys.push(String(deviceId).trim());
  if (fingerprint) keys.push(`fp:${String(fingerprint).trim()}`);
  if (ip) keys.push(`ip:${String(ip).trim()}`);
  const filter = keys.length ? { deviceId: { $in: keys } } : userId ? { user: userId } : null;
  if (!filter) throw new ApiError(400, 'deviceId, ip, fingerprint or userId is required');
  const r = await Device.updateMany(filter, { $set: { blocked: false, blockReason: null, blockedAt: null, blockedBy: null } });
  if (userId) {
    const u = await User.findById(userId);
    if (u && u.role !== 'admin') {
      u.isActive = true;
      if (u.status === 'suspended') u.status = u.role === 'nurse' ? 'pending' : 'active';
      await u.save();
    }
  }
  ResponseHelper.success(res, { matched: r.matchedCount ?? r.n, modified: r.modifiedCount ?? r.nModified }, 'تم فك الحظر — يستطيع الجهاز الدخول مجدداً');
  logAdmin(req, 'device.unblock', {
    targetType: userId ? 'user' : 'device',
    targetId: userId ? String(userId) : keys.join(','),
    details: `unblocked: ${userId ? String(userId) : keys.join(',')}`,
  });
});

// DELETE /admin/devices/:id — remove a tracking row (does not unban the fingerprint)
const deleteDevice = asyncHandler(async (req, res) => {
  await Device.findByIdAndDelete(req.params.id);
  ResponseHelper.success(res, { id: req.params.id }, 'تم حذف سجل الجهاز');
});

// ---------- AUDIT LOG ----------
// GET /admin/audit-log — fraud-prevention trail (admin panel only)
const listAuditLog = asyncHandler(async (req, res) => {
  const AuditLog = require('../models/AuditLog');
  const { search = '', action = '', page = 1, limit = 30 } = req.query;
  const q = {};
  if (action) q.action = String(action).slice(0, 60);
  if (search) {
    const rx = new RegExp(search.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ actorName: rx }, { action: rx }, { details: rx }, { targetId: rx }, { targetType: rx }];
  }
  const lim = Math.min(100, Math.max(1, parseInt(limit)));
  const pg = Math.max(1, parseInt(page));
  const [rows, total] = await Promise.all([
    AuditLog.find(q).populate('actor', 'fullName email').sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
    AuditLog.countDocuments(q),
  ]);
  ResponseHelper.success(res, {
    actions: ACTIONS,
    logs: rows.map((l) => ({
      id: String(l._id),
      actor: l.actor ? { id: String(l.actor._id), name: l.actor.fullName, email: l.actor.email } : { name: l.actorName || '—' },
      action: l.action, targetType: l.targetType, targetId: l.targetId,
      details: l.details, ip: l.ip, createdAt: l.createdAt,
    })),
    pagination: { page: pg, limit: lim, total },
  }, 'Audit log');
});

module.exports = { listAdmins, createAdmin, deleteAdmin, toggleAdminStatus, listDevices, getUserDevices, blockDevice, unblockDevice, deleteDevice, listAuditLog };
