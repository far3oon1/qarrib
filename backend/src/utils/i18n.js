// Bilingual API messages: every user-facing Arabic string gets an English
// twin. Responses always carry BOTH `message` (ar, default for old clients)
// and `message_en`, so the frontend can show the active language without
// the old DOM-scraping translator mangling full sentences.
const AR_TO_EN = {
  'تم إنشاء حساب المريض بنجاح': 'Patient account created successfully',
  'تم إنشاء حساب الممرض بنجاح': 'Nurse account created successfully',
  'تم إرسال طلب التسجيل، سيتم مراجعة بياناتك قريباً': 'Registration request sent, your data will be reviewed soon',
  'تم تسجيل الدخول بنجاح': 'Signed in successfully',
  'تم جلب البيانات بنجاح': 'Data fetched successfully',
  'تم تسجيل الخروج بنجاح': 'Signed out successfully',
  'تم رفع المستندات بنجاح': 'Documents uploaded successfully',
  'تم تحديث البيانات بنجاح': 'Profile updated successfully',
  'البريد الإلكتروني مسجل مسبقاً': 'Email already registered',
  'رقم الهاتف مسجل مسبقاً': 'Phone number already registered',
  'الرقم القومي مسجل مسبقاً': 'National ID already registered',
  'البريد الإلكتروني أو كلمة المرور غير صحيحة': 'Incorrect email or password',
  'رقم الهاتف أو كلمة المرور غير صحيحة': 'Incorrect phone number or password',
  'الحساب معطل، يرجى التواصل مع الدعم': 'Account is disabled, please contact support',
  'حسابك قيد المراجعة، سيتم إشعارك عند الموافقة': 'Your account is under review, you will be notified on approval',
  'تم رفض طلب التسجيل، يرجى التواصل مع الدعم': 'Registration request was rejected, please contact support',
  'User not found': 'User not found',
  'تم العثور على المستخدم': 'User found',
  'Qarrab API is running': 'Qarrab API is running',
  'Database unavailable, please try again shortly.': 'Database unavailable, please try again shortly.',
  'Too many requests, please try again later.': 'Too many requests, please try again later.',
  'تم إنشاء المستخدم بنجاح': 'User created successfully',
  'تم حذف المستخدم بنجاح': 'User deleted successfully',
  'تم تحديث المستخدم': 'User updated successfully',
  'المستخدم غير موجود': 'User not found',
  'لا يمكن حذف حساب أدمن': 'Cannot delete an admin account',
  'لا يمكن تعديل حساب أدمن': 'Cannot modify an admin account',
  'لا يمكن إنشاء حساب أدمن من هنا': 'Cannot create an admin account here',
  'الدور يجب أن يكون مريض أو ممرض': 'Role must be patient or nurse',
  'جميع الحقول مطلوبة: الاسم، البريد، الهاتف، كلمة المرور، الرقم القومي، الدور': 'All fields are required: name, email, phone, password, national ID, role',
  'قائمة المستخدمين': 'Users list',
  'بيانات المستخدم': 'User data',
};

function toEnglish(message) {
  if (!message || typeof message !== 'string') return message;
  if (AR_TO_EN[message] !== undefined) return AR_TO_EN[message];
  // Mongoose duplicate-key fallback comes in English already ("email is
  // already registered") — keep as-is.
  return message;
}

function pickLang(req) {
  const raw = String(
    (req && req.query && req.query.lang) ||
    (req && req.headers && (req.headers['x-lang'] || req.headers['x-language'])) ||
    (req && req.headers && req.headers['accept-language']) ||
    'ar'
  ).toLowerCase();
  return raw.startsWith('en') ? 'en' : 'ar';
}

// Attach both language variants to a payload. `message` stays Arabic-first
// for backwards compatibility; `message_en` lets new frontends render the
// active language exactly (no substring guessing).
function withBothLanguages(message) {
  const ar = message;
  const en = toEnglish(message);
  return { message: ar, message_en: en };
}

module.exports = { AR_TO_EN, toEnglish, pickLang, withBothLanguages };
