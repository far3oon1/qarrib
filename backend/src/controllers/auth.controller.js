const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { saveIdFile } = require('../utils/saveUpload');
const fs = require('fs');

const generateToken = (id, role) => {
  return require('jsonwebtoken').sign(
    { id, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const registerPatient = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password, nationalId, governorate, city, address, gender } = req.body;

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

  const token = generateToken(patient._id, patient.role);

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
  const {
    fullName, email, phone, password, nationalId,
    specialization, yearsOfExperience, bio,
    governorate, city, address, gender
  } = req.body;

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

  const token = generateToken(nurse._id, nurse.role);

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
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new ApiError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'الحساب معطل، يرجى التواصل مع الدعم');
  }

  if (user.role === 'nurse' && user.status === 'pending') {
    throw new ApiError(403, 'حسابك قيد المراجعة، سيتم إشعارك عند الموافقة');
  }

  if (user.role === 'nurse' && user.status === 'rejected') {
    throw new ApiError(403, 'تم رفض طلب التسجيل، يرجى التواصل مع الدعم');
  }

  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user._id, user.role);

  ResponseHelper.success(res, {
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      gender: user.gender
    },
    token
  }, 'تم تسجيل الدخول بنجاح');
});

const loginWithPhone = asyncHandler(async (req, res) => {
  const { phone, password } = req.body;

  const user = await User.findOne({ phone }).select('+password');

  if (!user) {
    throw new ApiError(401, 'رقم الهاتف أو كلمة المرور غير صحيحة');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'رقم الهاتف أو كلمة المرور غير صحيحة');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'الحساب معطل، يرجى التواصل مع الدعم');
  }

  if (user.role === 'nurse' && user.status === 'pending') {
    throw new ApiError(403, 'حسابك قيد المراجعة، سيتم إشعارك عند الموافقة');
  }

  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user._id, user.role);

  ResponseHelper.success(res, {
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      gender: user.gender
    },
    token
  }, 'تم تسجيل الدخول بنجاح');
});

 const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  ResponseHelper.success(res, { user }, 'تم جلب البيانات بنجاح');
});

const logout = asyncHandler(async (req, res) => {
  ResponseHelper.success(res, { ok: true }, 'تم تسجيل الخروج بنجاح');
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

module.exports = {
  registerPatient,
  registerNurse,
  login,
  loginWithPhone,
  logout,
  uploadDocuments,
  getMe,
  updateProfile,
  adminLogin,
  adminRegister,
  adminResetPassword
};
