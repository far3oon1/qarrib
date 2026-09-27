# قرّب - تطبيق خدمات التمريض المنزلية

## نظرة عامة
تطبيق ويب متكامل لربط المرضى بالممرضين مع نظام دفع آمن عبر Paymob.

## المميزات
- ✅ تسجيل مريض / ممرض / أدمن
- ✅ توثيق الممرضين (كارنيه + ترخيص مزاولة)
- ✅ طلب خدمة تمريض (6 أنواع)
- ✅ GPS حي لتتبع الممرض
- ✅ شات فوري مع مشاركة الموقع
- ✅ محفظة رقمية
- ✅ دفع آمن (فيزا + فودافون كاش + انستا باي)
- ✅ تأكيد مزدوج (مريض + ممرض = تحويل الفلوس)
- ✅ لوحة أدمن كاملة

## التشغيل

### 1. تثبيت المتطلبات
```bash
cd backend
npm install
```

### 2. إعداد البيئة
```bash
cp .env.example .env
# عدل القيم في ملف .env
```

### 3. تشغيل السيرفر
```bash
npm start
```

### 4. فتح التطبيق
```
http://localhost:5000
```

## بيانات الأدمن الافتراضية
- Email: admin@qarrib.com
- Password: admin123

## إعداد Paymob للإنتاج
1. سجل حساب تجاري على https://paymob.com
2. احصل على API Keys من Dashboard
3. أنشئ Integration IDs لكل وسيلة دفع
4. أضف الـ Keys في ملف `.env`

## API Endpoints

### Auth
- POST /api/auth/register/patient
- POST /api/auth/register/nurse
- POST /api/auth/login
- POST /api/auth/upload-documents

### Patient
- GET /api/patients/dashboard
- POST /api/patients/location
- GET /api/patients/nearby-nurses

### Nurse
- GET /api/nurses/dashboard
- GET /api/nurses/requests
- POST /api/nurses/toggle-status

### Orders
- POST /api/orders/create
- POST /api/orders/:id/accept
- POST /api/orders/:id/confirm

### Payments
- POST /api/payments/card
- POST /api/payments/wallet
- POST /api/payments/instapay
- POST /api/payments/webhook

### Admin
- GET /api/admin/dashboard
- GET /api/admin/users
- GET /api/admin/verifications
- POST /api/admin/verifications/:id

## الترخيص
MIT License
