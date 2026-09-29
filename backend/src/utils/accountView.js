// Role-based account views. Single source of truth for who sees what.
// - admin: full plaintext (online, admin panel only, never cached client-side).
// - assistant: masked — can help manage / chat / track, but NEVER sees
//   registration secrets (nationalId, full phone/email, payout account, password).
// - everyone else: minimal public-safe shape.
const { maskEmail, maskPhone, maskNationalId, maskAccount } = require('./encryption');

// Policies the admin can tick when creating a helper/assistant account.
const ASSISTANT_SCOPES = [
  { key: 'manage_orders', ar: 'إدارة الطلبات', en: 'Manage orders' },
  { key: 'support_chat', ar: 'محادثات الدعم (ممرض/مريض)', en: 'Support chat (nurse/patient)' },
  { key: 'verify_help', ar: 'مساعدة التوثيق (عرض بدون رقم قومي)', en: 'Verification help (no national ID)' },
  { key: 'manage_users_basic', ar: 'عرض/تفعيل الحسابات (بدون بيانات حساسة)', en: 'View/activate accounts (no sensitive data)' },
  { key: 'manage_payments_help', ar: 'متابعة المدفوعات (بدون حسابات السحب)', en: 'Follow payments (no payout accounts)' },
  { key: 'manage_feedbacks', ar: 'التقييمات والبلاغات', en: 'Feedbacks & reports' },
  { key: 'live_tracking_help', ar: 'المتابعة الحية للزيارات', en: 'Live visit tracking' },
];

const ASSISTANT_SCOPE_KEYS = ASSISTANT_SCOPES.map((s) => s.key);

function normalizeScopes(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(String))].filter((k) => ASSISTANT_SCOPE_KEYS.includes(k));
}

function hasScope(user, scope) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'assistant') return false;
  const scopes = Array.isArray(user.assistantScopes) ? user.assistantScopes : [];
  return scopes.includes(scope);
}

function toPlain(u) {
  if (!u) return null;
  const o = typeof u.toObject === 'function' ? u.toObject() : { ...u };
  if (o.permissions instanceof Map) o.permissions = Object.fromEntries(o.permissions);
  return o;
}

// Full admin view — includes decrypted registration + credential info.
// Passwords are hashed (bcrypt) and can NEVER be decrypted; instead we expose
// hasPassword + admin reset capability.
function adminView(u) {
  const o = toPlain(u);
  if (!o) return null;
  delete o.password;
  delete o.passwordResetToken;
  delete o.passwordResetExpires;
  delete o.sensitiveEnc;
  return {
    ...o,
    id: String(o._id || o.id),
    name: o.fullName,
    credentials: {
      email: o.email || null,
      phone: o.phone || null,
      nationalId: o.nationalId || null,
      hasPasswordSet: true,
      // Admin resets (never reads) the password — see POST /admin/users/:id/reset-password
      // and PUT /admin/users/:id/full { password }.
      passwordNote: 'Passwords are bcrypt-hashed and cannot be viewed. Use reset/set to change.',
    },
    registration: {
      fullName: o.fullName,
      email: o.email,
      phone: o.phone,
      nationalId: o.nationalId,
      gender: o.gender || null,
      role: o.role,
      status: o.status,
      isActive: o.isActive,
      location: o.location || null,
      idCardImage: o.idCardImage || null,
      licenseImage: o.licenseImage || null,
      specialization: o.specialization || null,
      yearsOfExperience: o.yearsOfExperience ?? null,
      bio: o.bio || null,
      payoutMethod: o.payoutMethod || null,
      payoutAccount: o.payoutAccount || null,
      walletBalance: o.walletBalance ?? 0,
      subscription: o.subscription || null,
      consents: o.consents || null,
      locationSharing: o.locationSharing || null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      lastLogin: o.lastLogin || null,
    },
    encrypted: true,
  };
}

// Masked assistant view — same account, zero secrets.
function assistantView(u) {
  const o = toPlain(u);
  if (!o) return null;
  return {
    id: String(o._id || o.id),
    name: o.fullName,
    role: o.role,
    status: o.status,
    isActive: o.isActive,
    email: maskEmail(o.email),
    phone: maskPhone(o.phone),
    nationalId: maskNationalId(o.nationalId),
    gender: o.gender || null,
    governorate: (o.location && o.location.governorate) || null,
    city: (o.location && o.location.city) || null,
    specialization: o.specialization || null,
    rating: o.rating ?? 0,
    isOnline: !!o.isOnline,
    createdAt: o.createdAt,
    // Deliberately OMITTED: payoutAccount, full address, ID images URLs,
    // wallet balance, consents, password info.
  };
}

function viewFor(role, u) {
  if (role === 'admin') return adminView(u);
  if (role === 'assistant') return assistantView(u);
  return assistantView(u);
}

module.exports = {
  ASSISTANT_SCOPES,
  ASSISTANT_SCOPE_KEYS,
  normalizeScopes,
  hasScope,
  adminView,
  assistantView,
  viewFor,
};
