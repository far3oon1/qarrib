const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { saveIdFile } = require('../utils/saveUpload');
const fs = require('fs');
const { getDeviceMeta, touchDevice, assertDeviceAllowed, assertUserNotBlocked } = require('../utils/device');

const generateToken = (id, role) => {
  return require('jsonwebtoken').sign(
    { id, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const registerPatient = asyncHandler(async (req, res) => {
  const meta = getDeviceMeta(req);
  await assertDeviceAllowed(meta);
  const { fullName, email, phone, password, nationalId, governorate, city, address, gender, acceptTerms } = req.body;

  // Liability waiver is mandatory: the app is a helper only.
  if (acceptTerms !== true && acceptTerms !== 'true') {
    throw new ApiError(400, 'يجب الموافقة على شروط الاستخدام وإخلاء المسؤولية أولاً / You must accept the Terms & liability waiver first');
  }

  const existingUser = await User.findOne({
    $or: [{ email }, { phone }, { nationalId }]
  });

  if (existingUser) {
    if (existingUser.email === email) throw new ApiError(409, 'البريد الإلكتروني مسجل مسبقاً');
    if (existingUser.phone === phone) throw new ApiError(409, 'رقم الهاتف مسجل مسبقاً');
    if (existingUser.nationalId === nationalId) throw new ApiError(409, 'الرقم القومي مسجل مسبقاً');
  }

  let idCardData = { url: null, publicId: null };
  const patientFile = req.file
    || (req.files && (req.files.idCardImage?.[0] || req.files.idCard?.[0] || req.files.image?.[0] || req.files.file?.[0] || req.files.document?.[0]))
    || (req.files && req.files.__all && req.files.__all[0])
    || null;
  if (patientFile) {
    idCardData = await saveIdFile(patientFile, 'qarrab/id-cards');
  }

  const patient = await User.create({
    fullName,
    email,
    phone,
    password,
    nationalId,
    role: 'patient',
    status: 'active',
    gender: gender || null,
    idCardImage: idCardData,
    location: { governorate, city, address }
  });
  try { require('../utils/terms').grantTerms(patient); await patient.save(); } catch (_) { /* waiver best-effort */ }

  const token = generateToken(patient._id, patient.role);

  await touchDevice.call(meta, { source: 'register', user: patient });

  ResponseHelper.success(res, {
    user: {
      id: patient._id,
      fullName: patient.fullName,
      email: patient.email,
      phone: patient.phone,
      role: patient.role,
      status: patient.status
    },
    token
  }, 'تم إنشاء حساب المريض بنجاح', 201);
});

const registerNurse = asyncHandler(async (req, res) => {
  const meta = getDeviceMeta(req);
  await assertDeviceAllowed(meta);
  const {
    fullName, email, phone, password, nationalId,
    specialization, yearsOfExperience, bio,
    governorate, city, address, gender, acceptTerms
  } = req.body;

  // Liability waiver is mandatory: the app is a helper only.
  if (acceptTerms !== true && acceptTerms !== 'true') {
    throw new ApiError(400, 'يجب الموافقة على شروط الاستخدام وإخلاء المسؤولية أولاً / You must accept the Terms & liability waiver first');
  }

  const existingUser = await User.findOne({
    $or: [{ email }, { phone }, { nationalId }]
  });

  if (existingUser) {
    if (existingUser.email === email) throw new ApiError(409, 'البريد الإلكتروني مسجل مسبقاً');
    if (existingUser.phone === phone) throw new ApiError(409, 'رقم الهاتف مسجل مسبقاً');
    if (existingUser.nationalId === nationalId) throw new ApiError(409, 'الرقم القومي مسجل مسبقاً');
  }

  let idCardData = { url: null, publicId: null };
  let licenseData = { url: null, publicId: null };

  const pickFile = (names) => {
    if (!req.files) return null;
    for (const n of names) {
      if (req.files[n] && req.files[n][0]) return req.files[n][0];
    }
    return null;
  };
  const allFiles = (req.files && req.files.__all) || [];
  if (Array.isArray(req.files) && req.files.length && !allFiles.length) {
    allFiles.push(...req.files);
  }

  const idFile = pickFile(['idCardImage', 'idCard', 'image', 'file', 'document', 'idDocument']) || allFiles[0] || req.file || null;
  let licFile = pickFile(['licenseImage', 'license']) || null;
  if (!licFile && allFiles.length >= 2) {
    licFile = allFiles.find((f) => f !== idFile) || allFiles[1];
  }

  if (idFile) {
    idCardData = await saveIdFile(idFile, 'qarrab/id-cards');
  }
  if (licFile) {
    licenseData = await saveIdFile(licFile, 'qarrab/licenses');
  }

  const nurse = await User.create({
    fullName,
    email,
    phone,
    password,
    nationalId,
    role: 'nurse',
    status: 'pending',
    gender,
    idCardImage: idCardData,
    licenseImage: licenseData,
    specialization,
    yearsOfExperience,
    bio: bio || null,
    location: { governorate, city, address }
  });
  try { require('../utils/terms').grantTerms(nurse); await nurse.save(); } catch (_) { /* waiver best-effort */ }

  const token = generateToken(nurse._id, nurse.role);

  await touchDevice.call(meta, { source: 'register', user: nurse });

  ResponseHelper.success(res, {
    user: {
      id: nurse._id,
      fullName: nurse.fullName,
      email: nurse.email,
      phone: nurse.phone,
      role: nurse.role,
      status: nurse.status
    },
    message: 'تم إرسال طلب التسجيل، سيتم مراجعة بياناتك قريباً',
    token
  }, 'تم إنشاء حساب الممرض بنجاح', 201);
});

const login = asyncHandler(async (req, res) => {
  const meta = getDeviceMeta(req);
  await assertDeviceAllowed(meta);
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new ApiError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }

  // This account blocked by admin (any of its devices) -> show the
  // blocked-for-rules sentence, even from a fresh device. Runs before the
  // isActive/status checks so it takes precedence over generic messages.
  await assertUserNotBlocked(user);

  if (!user.isActive) {
    throw new ApiError(403, 'الحساب معطل، يرجى التواصل مع الدعم');
  }

  if (user.role === 'nurse' && user.status === 'pending') {
    throw new ApiError(403, 'حسابك قيد المراجعة، سيتم إشعارك عند الموافقة');
  }

  if (user.role === 'nurse' && user.status === 'rejected') {
    throw new ApiError(403, 'تم رفض طلب التسجيل، يرجى التواصل مع الدعم');
  }

  if (user.role === 'assistant' && !user.isActive) {
    throw new ApiError(403, 'Helper account is disabled');
  }

  user.lastLogin = new Date();
  await user.save();

  await touchDevice.call(meta, { source: 'login', user });

  const token = generateToken(user._id, user.role);

  // Liability waiver: patients/nurses registered before the waiver (or after
  // a terms update) must accept it on sign-in before using the app.
  let needsTermsAcceptance = false;
  try {
    const { termsAccepted, TERMS_VERSION } = require('../utils/terms');
    if (['patient', 'nurse'].includes(user.role) && !termsAccepted(user)) needsTermsAcceptance = true;
  } catch (_) {}

  ResponseHelper.success(res, {
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      gender: user.gender,
      needsTermsAcceptance,
      ...(user.role === 'assistant' ? {
        assistantLabel: user.assistantLabel || null,
        assistantScopes: Array.isArray(user.assistantScopes) ? user.assistantScopes : [],
      } : {}),
    },
    token
  }, needsTermsAcceptance ? 'يرجى الموافقة على شروط الاستخدام أولاً / Please accept the Terms first' : 'تم تسجيل الدخول بنجاح');
});

const loginWithPhone = asyncHandler(async (req, res) => {
  const meta = getDeviceMeta(req);
  await assertDeviceAllowed(meta);
  const { phone, password } = req.body;

  const user = await User.findOne({ phone }).select('+password');

  if (!user) {
    throw new ApiError(401, 'رقم الهاتف أو كلمة المرور غير صحيحة');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'رقم الهاتف أو كلمة المرور غير صحيحة');
  }

  await assertUserNotBlocked(user);

  if (!user.isActive) {
    throw new ApiError(403, 'الحساب معطل، يرجى التواصل مع الدعم');
  }

  if (user.role === 'nurse' && user.status === 'pending') {
    throw new ApiError(403, 'حسابك قيد المراجعة، سيتم إشعارك عند الموافقة');
  }

  user.lastLogin = new Date();
  await user.save();

  await touchDevice.call(meta, { source: 'login', user });

  const token = generateToken(user._id, user.role);

  let needsTermsAcceptancePhone = false;
  try {
    const { termsAccepted } = require('../utils/terms');
    if (['patient', 'nurse'].includes(user.role) && !termsAccepted(user)) needsTermsAcceptancePhone = true;
  } catch (_) {}

  ResponseHelper.success(res, {
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      gender: user.gender,
      needsTermsAcceptance: needsTermsAcceptancePhone,
      ...(user.role === 'assistant' ? {
        assistantLabel: user.assistantLabel || null,
        assistantScopes: Array.isArray(user.assistantScopes) ? user.assistantScopes : [],
      } : {}),
    },
    token
  }, needsTermsAcceptancePhone ? 'يرجى الموافقة على شروط الاستخدام أولاً / Please accept the Terms first' : 'تم تسجيل الدخول بنجاح');
});

  const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  // Attach effective feature permissions so the GUI can hide/disable gated buttons
  try {
    const { effectivePermissions } = require('./permissions.controller');
    const uo = user.toObject();
    uo.effectivePermissions = effectivePermissions(user);
    ResponseHelper.success(res, { user: uo }, 'تم جلب البيانات بنجاح');
  } catch (_) {
    ResponseHelper.success(res, { user }, 'تم جلب البيانات بنجاح');
  }
});

const logout = asyncHandler(async (req, res) => {
  ResponseHelper.success(res, { ok: true }, 'تم تسجيل الخروج بنجاح');
});

// GET /api/auth/terms — public bilingual liability waiver (helper-only app)
const getTerms = asyncHandler(async (req, res) => {
  const { TERMS_VERSION, TERMS_AR, TERMS_EN } = require('../utils/terms');
  ResponseHelper.success(res, { version: TERMS_VERSION, ar: TERMS_AR, en: TERMS_EN }, 'Terms of use');
});

// POST /api/auth/accept-terms {accept: true} — signed-in user accepts waiver
const acceptTerms = asyncHandler(async (req, res) => {
  if (req.body.accept !== true && req.body.accept !== 'true') {
    throw new ApiError(400, 'يجب الموافقة على الشروط أولاً / You must accept the terms first');
  }
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, 'User not found');
  const { grantTerms, TERMS_VERSION } = require('../utils/terms');
  grantTerms(user);
  await user.save();
  ResponseHelper.success(res, { accepted: true, version: TERMS_VERSION }, 'تم قبول الشروط بنجاح / Terms accepted');
});

const getAdminContact = asyncHandler(async (req, res) => {
  const admin = await User.findOne({ role: 'admin' }).select('_id fullName name');
  if (!admin) throw new ApiError(404, 'No admin found');
  ResponseHelper.success(res, {
    id: String(admin._id),
    name: admin.fullName || admin.name || 'الإدارة'
  }, 'Admin contact');
});

// Frontend compat: re-upload verification docs after registration
// (national ID for patients; ID + nursing license for nurses)
// Accepts ANY field name and ANY file type.
const uploadDocuments = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, 'User not found');

  const allFiles = (req.files && req.files.__all) || (Array.isArray(req.files) ? req.files : []);
  const getNamed = (names) => {
    if (!req.files || Array.isArray(req.files)) return null;
    for (const n of names) {
      if (req.files[n] && req.files[n][0]) return req.files[n][0];
    }
    return null;
  };

  if (req.files && !Array.isArray(req.files)) {
    const idFile = getNamed(['idCardImage', 'idCard', 'image', 'file', 'document', 'idDocument']) || allFiles[0] || null;
    let licFile = getNamed(['licenseImage', 'license']) || null;
    if (!licFile && allFiles.length >= 2) licFile = allFiles.find((f) => f !== idFile) || null;
    if (idFile) user.idCardImage = await saveIdFile(idFile, 'qarrab/id-cards');
    if (licFile) user.licenseImage = await saveIdFile(licFile, 'qarrab/licenses');
    if (!idFile && !licFile && req.file) {
      user.idCardImage = await saveIdFile(req.file, 'qarrab/id-cards');
    }
  } else if (Array.isArray(req.files) && req.files.length) {
    user.idCardImage = await saveIdFile(req.files[0], 'qarrab/id-cards');
    if (req.files[1]) user.licenseImage = await saveIdFile(req.files[1], 'qarrab/licenses');
  } else if (req.file) {
    // handleUploadSingle stores first file in req.file regardless of field name
    user.idCardImage = await saveIdFile(req.file, 'qarrab/id-cards');
    if (allFiles[1]) user.licenseImage = await saveIdFile(allFiles[1], 'qarrab/licenses');
  }

  if (user.role === 'nurse') user.status = 'pending';
  await user.save();
  ResponseHelper.success(res, { user }, 'تم رفع المستندات بنجاح');
});

const updateProfile = asyncHandler(async (req, res) => {
  const updates = req.body;
  const allowedFields = ['fullName', 'phone', 'bio', 'location', 'gender'];

  const filteredUpdates = {};
  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  });

  const user = await User.findByIdAndUpdate(
    req.user.id,
    filteredUpdates,
    { new: true, runValidators: true }
  );

  ResponseHelper.success(res, { user }, 'تم تحديث البيانات بنجاح');
});

// --- Dedicated Admin Login ---
const adminLogin = asyncHandler(async (req, res) => {
  const meta = getDeviceMeta(req);
  await assertDeviceAllowed(meta);
  const { email, password, secretKey } = req.body;

  if (!process.env.ADMIN_DEFAULT_EMAIL) {
    throw new ApiError(500, 'Admin login is not configured');
  }

  if (!secretKey || secretKey !== process.env.ADMIN_SECRET_KEY) {
    throw new ApiError(403, 'Access denied. Invalid access key.');
  }

  const admin = await User.findOne({ email }).select('+password');
  if (!admin) {
    throw new ApiError(401, 'Admin credentials incorrect');
  }

  if (admin.role !== 'admin') {
    throw new ApiError(403, 'Not an admin account');
  }

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Admin credentials incorrect');
  }

  if (!admin.isActive) {
    throw new ApiError(403, 'Admin account is disabled');
  }

  admin.lastLogin = new Date();
  await admin.save();

  await touchDevice.call(meta, { source: 'login', user: admin });

  const token = generateToken(admin._id, admin.role);

  ResponseHelper.success(res, {
    user: {
      id: admin._id,
      fullName: admin.fullName,
      email: admin.email,
      role: admin.role,
      status: admin.status
    },
    token
  }, 'Admin login successful');
});

const adminRegister = asyncHandler(async (req, res) => {
  if (!process.env.ADMIN_DEFAULT_EMAIL) {
    throw new ApiError(500, 'Admin registration is not configured');
  }

  const { secretKey } = req.body;
  if (!secretKey || secretKey !== process.env.ADMIN_SECRET_KEY) {
    throw new ApiError(403, 'Access denied. Invalid access key.');
  }

  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    throw new ApiError(403, 'Admin already exists. Use login instead.');
  }

  const { fullName, email, password } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(409, 'Email already registered');
  }

  const admin = await User.create({
    fullName,
    email,
    password,
    phone: '01000000000',
    nationalId: '00000000000000',
    role: 'admin',
    status: 'active',
    isActive: true
  });

  const token = generateToken(admin._id, admin.role);

  ResponseHelper.success(res, {
    user: {
      id: admin._id,
      fullName: admin.fullName,
      email: admin.email,
      role: admin.role
    },
    token
  }, 'Admin account created successfully', 201);
});

const adminResetPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = await User.findOne({ role: 'admin' }).select('+password');

  if (!admin) {
    throw new ApiError(404, 'No admin account found');
  }

  const isMatch = await admin.comparePassword(currentPassword);
  if (!isMatch) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  admin.password = newPassword;
  await admin.save();

  ResponseHelper.success(res, { message: 'Password updated successfully' }, 'Password updated');
});

// --- Dedicated Assistant (helper) Login ---
// Online endpoint for helper accounts created by the admin.
// No secret key (helpers are not admins); role + active checks enforced.
const assistantLogin = asyncHandler(async (req, res) => {
  const meta = getDeviceMeta(req);
  await assertDeviceAllowed(meta);
  const { email, password } = req.body;

  const assistant = await User.findOne({ email }).select('+password');
  if (!assistant) {
    throw new ApiError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }
  if (assistant.role !== 'assistant') {
    throw new ApiError(403, 'Not a helper account — use the patient/nurse sign-in');
  }

  const isMatch = await assistant.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }

  if (!assistant.isActive) {
    throw new ApiError(403, 'Helper account is disabled — contact the admin');
  }

  assistant.lastLogin = new Date();
  await assistant.save();

  await touchDevice.call(meta, { source: 'login', user: assistant });

  const token = generateToken(assistant._id, assistant.role);

  ResponseHelper.success(res, {
    user: {
      id: assistant._id,
      fullName: assistant.fullName,
      email: assistant.email,
      phone: assistant.phone,
      role: assistant.role,
      status: assistant.status,
      assistantLabel: assistant.assistantLabel || null,
      assistantScopes: Array.isArray(assistant.assistantScopes) ? assistant.assistantScopes : [],
    },
    token
  }, 'Welcome back — helper sign-in successful');
});

module.exports = {
  registerPatient,
  registerNurse,
  login,
  loginWithPhone,
  logout,
  uploadDocuments,
  getMe,
  getAdminContact,
  updateProfile,
  getTerms,
  acceptTerms,
  adminLogin,
  adminRegister,
  adminResetPassword,
  assistantLogin
};
