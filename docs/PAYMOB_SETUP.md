# دليل إعداد Paymob

## الخطوة 1: التسجيل
1. ادخل على https://paymob.com
2. اضغط "Sign Up" واختر "Business Account"
3. أكمل بياناتك (اسم الشركة، بريد، هاتف)

## الخطوة 2: التوثيق
ستحتاج:
- سجل تجاري أو شهادة عمل حر
- بطاقة ضريبية
- صورة البطاقة الشخصية
- بيانات حساب بنكي

## الخطوة 3: الحصول على API Keys
1. ادخل Dashboard
2. اذهب إلى Developers → API Keys
3. انسخ:
   - API Key
   - Secret Key
   - Public Key
   - HMAC Secret

## الخطوة 4: إنشاء Integrations
1. Developers → Payment Integrations
2. أنشئ Integration لكل وسيلة:
   - Cards (فيزا/ماستركارد)
   - Mobile Wallets (فودافون كاش)
   - InstaPay
3. انسخ Integration ID لكل واحدة

## الخطوة 5: إعداد IFrame
1. Developers → IFrames
2. أنشئ IFrame جديد
3. اختر Integration الخاص بالكروت
4. انسخ IFrame ID

## الخطوة 6: إعداد Webhook
1. Developers → Webhooks
2. أضف Webhook URL:
   ```
   https://your-domain.com/api/payments/webhook
   ```
3. اختر الأحداث: transaction.success, transaction.failed

## الخطوة 7: ملء ملف .env
```env
PAYMOB_API_KEY=your_api_key_here
PAYMOB_SECRET_KEY=your_secret_key_here
PAYMOB_PUBLIC_KEY=your_public_key_here
PAYMOB_HMAC_SECRET=your_hmac_secret_here
PAYMOB_IFRAME_ID=your_iframe_id
PAYMOB_CARD_INTEGRATION_ID=your_card_id
PAYMOB_WALLET_INTEGRATION_ID=your_wallet_id
PAYMOB_INSTAPAY_INTEGRATION_ID=your_instapay_id
```

## اختبار في Sandbox
- استخدم بيانات الاختبار من Paymob Docs
- جرب الدفع ببطاقة وهمية: 4111111111111111

## للدعم
- docs.paymob.com
- support@paymob.com
