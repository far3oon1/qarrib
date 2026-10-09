const User = require('../models/User');
const Notification = require('../models/Notification');
const PermissionSettings = require('../models/PermissionSettings');
const ResponseHelper = require('../utils/response');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// All known feature permission keys (admin can toggle per user from GUI)
const KNOWN_PERMISSIONS = [
  'view_orders', 'accept_orders', 'submit_offers', 'start_service', 'end_service',
  'live_tracking', 'call_patient', 'call_nurse', 'chat', 'wallet_view',
  'wallet_withdraw', 'receive_alerts', 'share_location', 'upload_photos', 'rate_feedback'
];

const DEFAULTS_BY_ROLE = {
  patient: {
    view_orders: true, accept_orders: false, submit_offers: false, start_service: false,
    end_service: true, live_tracking: true, call_patient: false, call_nurse: true,
    chat: true, wallet_view: true, wallet_withdraw: false, receive_alerts: true,
    share_location: true, upload_photos: true, rate_feedback: true
  },
  nurse: {
    view_orders: true, accept_orders: true, submit_offers: true, start_service: true,
    end_service: true, live_tracking: true, call_patient: true, call_nurse: false,
    chat: true, wallet_view: true, wallet_withdraw: true, receive_alerts: true,
    share_location: true, upload_photos: true, rate_feedback: true
  },
  admin: Object.fromEntries(KNOWN_PERMISSIONS.map((k) => [k, true]))
};

function effectivePermissions(user) {
  const base = { ...(DEFAULTS_BY_ROLE[user.role] || DEFAULTS_BY_ROLE.patient) };
  if (user.permissions) {
    const raw = typeof user.permissions.toObject === 'function' ? user.permissions.toObject() : user.permissions;
    const obj = raw instanceof Map ? Object.fromEntries(raw) : raw;
    for (const k of Object.keys(obj || {})) base[k] = !!obj[k];
  }
  return base;
}

function can(user, key) {
  return !!effectivePermissions(user)[key];
}

// GET /api/permissions/required — what this user must grant (role-based)
const getRequired = asyncHandler(async (req, res) => {
  const settings = await PermissionSettings.getSingleton();
  const role = req.user.role === 'admin' ? 'nurse' : req.user.role;
  const me = await User.findById(req.user.id).select('consents locationSharing permissions role');
  ResponseHelper.success(res, {
    required: settings.required[role] || settings.required.patient,
    allRequired: settings.required,
    legal: settings.legal,
    myConsents: me.consents || {},
    myLocationSharing: me.locationSharing || {},
    myPermissions: effectivePermissions(me),
    knownPermissions: KNOWN_PERMISSIONS
  }, 'Permission requirements');
});

// POST /api/permissions/consent {location?, gallery?, calling?, notifications?, terms?}
const saveConsent = asyncHandler(async (req, res) => {
  const me = await User.findById(req.user.id);
  if (!me) throw new ApiError(404, 'User not found');
  const keys = ['location', 'gallery', 'calling', 'notifications', 'terms'];
  for (const k of keys) {
    if (req.body[k] !== undefined) {
      me.consents[k] = { granted: !!req.body[k], updatedAt: new Date() };
      // Liability-waiver versioning: granting terms stamps the current text
      // version so re-published terms can be re-requested later.
      if (k === 'terms' && !!req.body[k]) {
        try { me.consents[k].version = require('../utils/terms').TERMS_VERSION; } catch (_) {}
      }
    }
  }
  // Toggling live sharing from the track pages
  if (req.body.shareLiveLocation !== undefined) {
    me.locationSharing.shareLiveLocation = !!req.body.shareLiveLocation;
  }
  if (req.body.shareWithPatient !== undefined) me.locationSharing.shareWithPatient = !!req.body.shareWithPatient;
  if (req.body.shareWithNurse !== undefined) me.locationSharing.shareWithNurse = !!req.body.shareWithNurse;
  await me.save();
  try {
    const { emitToUser } = require('../sockets');
    emitToUser(String(me._id), 'permissions_update', { consents: me.consents, locationSharing: me.locationSharing });
  } catch (_) {}
  ResponseHelper.success(res, { consents: me.consents, locationSharing: me.locationSharing }, 'Consents saved');
});

// --- Admin GUI ---
// GET /api/admin/permissions/settings
const adminGetSettings = asyncHandler(async (req, res) => {
  const settings = await PermissionSettings.getSingleton();
  ResponseHelper.success(res, { required: settings.required, legal: settings.legal, knownPermissions: KNOWN_PERMISSIONS }, 'Permission settings');
});

// PUT /api/admin/permissions/settings {required?, legal?}
const adminUpdateSettings = asyncHandler(async (req, res) => {
  const settings = await PermissionSettings.getSingleton();
  if (req.body.required) {
    for (const role of ['patient', 'nurse']) {
      if (req.body.required[role]) {
        for (const k of ['location', 'gallery', 'calling', 'notifications', 'terms']) {
          if (req.body.required[role][k] !== undefined) settings.required[role][k] = !!req.body.required[role][k];
        }
      }
    }
  }
  if (req.body.legal) {
    if (req.body.legal.title !== undefined) settings.legal.title = String(req.body.legal.title);
    if (req.body.legal.body !== undefined) settings.legal.body = String(req.body.legal.body);
    settings.legal.updatedAt = new Date();
  }
  await settings.save();
  ResponseHelper.success(res, { required: settings.required, legal: settings.legal }, 'Permission settings updated');
});

// GET /api/admin/permissions/users?role=&search= — users with effective permissions
const adminListUserPermissions = asyncHandler(async (req, res) => {
  const { role, search } = req.query;
  const query = { role: { $in: ['patient', 'nurse', 'admin'] } };
  if (role) query.role = role;
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }
  const users = await User.find(query).select('fullName email phone role status consents locationSharing permissions').sort({ createdAt: -1 }).limit(60).lean();
  ResponseHelper.success(res, users.map((u) => ({
    id: String(u._id), name: u.fullName, email: u.email, phone: u.phone,
    role: u.role, status: u.status,
    permissions: { ...(DEFAULTS_BY_ROLE[u.role] || {}), ...(u.permissions instanceof Map ? Object.fromEntries(u.permissions) : (u.permissions || {})) },
    consents: u.consents || {}, locationSharing: u.locationSharing || {}
  })), 'User permissions');
});

// PUT /api/admin/permissions/users/:id {permissions: {key: bool}, locationSharing?, approveLocation?}
const adminUpdateUserPermissions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (req.body.permissions) {
    if (!user.permissions) user.permissions = new Map();
    const incoming = req.body.permissions;
    for (const k of Object.keys(incoming)) {
      if (!KNOWN_PERMISSIONS.includes(k)) continue; // ignore unknown
      user.permissions.set(k, !!incoming[k]);
    }
  }
  if (req.body.locationSharing) {
    for (const k of ['shareLiveLocation', 'shareWithPatient', 'shareWithNurse', 'approvedByAdmin']) {
      if (req.body.locationSharing[k] !== undefined) user.locationSharing[k] = !!req.body.locationSharing[k];
    }
  }
  if (req.body.approveLocation !== undefined) {
    user.locationSharing.approvedByAdmin = !!req.body.approveLocation;
  }
  await user.save();
  await Notification.create({
    recipient: user._id, title: 'تحديث الصلاحيات',
    message: 'حدّثت الإدارة صلاحيات حسابك — تحقق من الميزات المتاحة لك', type: 'system'
  });
  try {
    const { emitToUser } = require('../sockets');
    emitToUser(String(user._id), 'permissions_update', { permissions: effectivePermissions(user), locationSharing: user.locationSharing });
    emitToUser(String(user._id), 'notification', { title: 'تحديث الصلاحيات' });
  } catch (_) {}
  ResponseHelper.success(res, { id: String(user._id), permissions: effectivePermissions(user), locationSharing: user.locationSharing }, 'User permissions updated');
});

module.exports = {
  KNOWN_PERMISSIONS, DEFAULTS_BY_ROLE, effectivePermissions, can,
  getRequired, saveConsent,
  adminGetSettings, adminUpdateSettings, adminListUserPermissions, adminUpdateUserPermissions
};
