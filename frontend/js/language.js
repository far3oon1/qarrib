(function () {
    'use strict';

    var translations = {
        'قرّب': 'Qarrib',
        'تثبيت قرّب': 'Install Qarrib',
        'قرّب - خدمات التمريض المنزلية': 'Qarrib - Home Nursing Services',
        'وصول الأدمن - قرّب': 'Admin Access - Qarrib',
        'وصول محمي - مسؤول فقط': 'Protected access - administrators only',
        'لوحة الأدمن - قرّب': 'Admin Dashboard - Qarrib',
        'لوحة التحكم': 'Dashboard',
        'لوحة التحكم - مريض': 'Patient Dashboard',
        'لوحة التحكم - ممرض': 'Nurse Dashboard',
        'لوحة تحكم الأدمن': 'Admin Dashboard',
        'إنشاء حساب مريض': 'Create patient account',
        'إنشاء حساب ممرضة': 'Create nurse account',
        'التوثيق - أدمن': 'Verification - Admin',
        'محادثة - قرّب': 'Conversation - Qarrib',
        '🔐 تسجيل دخول الأدمن': '🔐 Admin sign in',
        '🔓 دخول كأدمن': '🔓 Sign in as admin',
        '👥 إدارة المرضى': '👥 Manage patients',
        '👥 تسجيل مريض جديد': '👥 Register a new patient',
        '👨‍⚕️ إدارة الممرضات': '👨‍⚕️ Manage nurses',
        '👨‍⚕️ تسجيل ممرضة جديدة': '👨‍⚕️ Register a new nurse',
        '➕ إضافة مريض': '➕ Add patient',
        '➕ إضافة ممرضة': '➕ Add nurse',
        '💰 المعاملات': '💰 Transactions',
        '💰 تحديث الأرباح': '💰 Update earnings',
        '💰 السعر يحدده الممرض — ستصلك عروض الأسعار للموافقة عليها قبل الدفع.': '💰 The nurse sets the price. Review and approve an offer before payment.',
        '💳 حساب استلام مستحقاتك': '💳 Account for receiving your earnings',
        '💵 تعيين الأسعار': '💵 Set prices',
        '🔄 إعادة تعيين المدفوعات': '🔄 Reset payments',
        '📞 اتصال': '📞 Call',
        '📍 المسافة:': '📍 Distance:',
        '💬 رسالة': '💬 Message',
        '👴 مسنين': '👴 Elder care',
        '💉 حقن': '💉 Injections',
        '💊 محاليل': '💊 IV fluids',
        '💪 علاج طبيعي': '💪 Physiotherapy',
        '🩹 جروح': '🩹 Wound care',
        '🩺 فحص': '🩺 Checkup',
        '-- اختر ممرضة --': '-- Choose a nurse --',
        '14 رقم': '14 digits',
        'أدخل الاسم': 'Enter a name',
        'أدخل السعر': 'Enter a price',
        'أدخل رمز الوصول السري': 'Enter the secret access code',
        'اشرح الحالة المرضية...': 'Describe the medical condition...',
        'اكتب رسالة للممرض/المريض...': 'Write a message to the nurse/patient...',
        'اكتب رسالة...': 'Write a message...',
        'الشارع، العمارة، الشقة...': 'Street, building, apartment...',
        'القاهرة، مصر الجديدة...': 'Cairo, Heliopolis...',
        'تتبع الممرض': 'Track nurse',
        'الجنس': 'Gender',
        'كلمة المرور': 'Password',
        'قيد الانتظار': 'Pending',
        'متصل': 'Online',
        'متصلين': 'Online',
        'مرضى': 'Patients',
        'ممرضين': 'Nurses',
        'نسخ': 'Copy',
        'نوع الحساب': 'Account type',
        'نوع الخدمة': 'Service type',
        'مثال: 01xxxxxxxxx': 'Example: 01xxxxxxxxx',
        'مثال: 123456789': 'Example: 123456789',
        'محادثة': 'Conversation',
        'مرحباً': 'Hello',
        'مرحباً بك': 'Welcome',
        'مكتمل': 'Completed',
        'كم | ⏱️ الوصول:': 'km | ⏱️ arrival:',
        'تسجيل الدخول': 'Sign in',
        'ابدأ الآن': 'Get started',
        'أقرب ممرض لك في أي وقت وفي أي مكان': 'The nearest nurse, whenever and wherever you need one',
        'أقرب ممرض لك في أي وقت': 'The nearest nurse, whenever you need one',
        'احصل على رعاية تمريضية في منزلك': 'Get nursing care at home',
        'اطلب خدمة تمريض منزلية واحصل على رعاية طبية احترافية بضغطة زر': 'Request home nursing care and get professional medical support with one tap',
        'لماذا قرّب؟': 'Why Qarrib?',
        'سرعة الوصول': 'Fast response',
        'أقرب ممرض متاح يصلك في دقائق معدودة': 'The nearest available nurse can reach you in minutes',
        'أمان تام': 'Your safety comes first',
        'جميع الممرضين موثقين ومعتمدين من الوزارة': 'All nurses are verified and licensed by the ministry',
        'دفع آمن': 'Secure payment',
        'ادفع بفيزا، فودافون كاش، أو انستا باي': 'Pay by Visa, Vodafone Cash, or InstaPay',
        'كيف يعمل؟': 'How it works',
        'اطلب الخدمة': 'Request a service',
        'اختر نوع الخدمة وحدد موقعك': 'Choose a service and set your location',
        'قبول الطلب': 'Request accepted',
        'أقرب ممرض يقبل طلبك فوراً': 'The nearest nurse can accept your request right away',
        'تتبع الموقع': 'Track your nurse',
        'تابع مكان الممرض لحظة بلحظة': 'Follow your nurse’s location in real time',
        'الدفع الآمن': 'Secure payment',
        'ادفع بعد التأكد من إتمام الخدمة': 'Pay after the service is complete',
        'سجل مجاناً واستمتع بخدماتنا': 'Sign up for free and enjoy our services',
        'سجل كمريض': 'Register as a patient',
        'سجل كممرض': 'Register as a nurse',
        'أنا مريض': 'I’m a patient',
        'أنا ممرض': 'I’m a nurse',
        '👤 مريض': '👤 Patient',
        '👨‍⚕️ ممرض': '👨‍⚕️ Nurse',
        '👤 تسجيل دخول المريض': '👤 Patient sign in',
        '👨‍⚕️ تسجيل دخول الممرض': '👨‍⚕️ Nurse sign in',
        'الأدمن': 'Admin',
        'مريض': 'Patient',
        'ممرض': 'Nurse',
        'ممرضة': 'Nurse',
            'تسجيل الدخول - قرّب': 'Sign in - Qarrib',
        'المريض': 'Patient',
        'الممرضة': 'Nurse',
        'ذكر': 'Male',
        'أنثى': 'Female',
        'الرئيسية': 'Home',
        'خروج': 'Log out',
        'الطلبات': 'Orders',
        'جميع الطلبات': 'All orders',
        'الطلبات النشطة': 'Active orders',
        'الطلبات المتاحة': 'Available requests',
        'طلبات متاحة': 'Available requests',
        'طلباتي': 'My orders',
        'العروض': 'Offers',
        'عروض الممرضات': 'Nurse offers',
        'طلب': 'Request',
        'طلب خدمة تمريض': 'Request nursing care',
        'المحفظة': 'Wallet',
        'التحويلات الواردة': 'Incoming transfers',
        'طلب سحب': 'Request withdrawal',
        'طريقة السحب': 'Withdrawal method',
        'الشات': 'Chat',
        'الرسائل': 'Messages',
        'الإشعارات': 'Notifications',
        'المستخدمين': 'Users',
        'إجمالي الطلبات': 'Total orders',
        'إجمالي الأرباح': 'Total earnings',
        'إجمالي الدفع': 'Total payments',
        'إجمالي الشحن': 'Total top-ups',
        'إجمالي العمولات': 'Total commissions',
        'أرباح الممرضات': 'Nurse earnings',
        'العمولات': 'Commissions',
        'عمولات المنصة': 'Platform commissions',
        'الإيرادات': 'Revenue',
        'الأرباح': 'Earnings',
        'التقييم': 'Rating',
        'الحالة:': 'Status:',
        'غير متصل': 'Offline',
        'غير متصلين': 'Offline',
        'جاري': 'In progress',
        'جاري التحميل...': 'Loading...',
        'جاري تحميل الخريطة...': 'Loading map...',
        'الكل': 'All',
        'التالي': 'Next',
        'السابق': 'Previous',
        'إرسال': 'Send',
        'إرسال الطلب': 'Submit request',
        'إرسال رصيد لممرضة': 'Send balance to a nurse',
        'إرسال للممرضة': 'Send to nurse',
        'تأكيد التحويل': 'Confirm transfer',
        'تحديد الكل كمقروء': 'Mark all as read',
        'إلغاء': 'Cancel',
        'حفظ رقم الحساب': 'Save account number',
        'تعيين السعر': 'Set price',
        'تعيين سعر خدمة جديدة': 'Set a new service price',
        'اختر الخدمة': 'Choose a service',
        'اختر الممرضة': 'Choose a nurse',
        'اختر نوع الخدمة وحدد موقعك': 'Choose the service and set your location',
        'اختر التخصص': 'Choose a specialty',
        'اختر الجنس': 'Choose a gender',
        'تفاصيل إضافية': 'Additional details',
        'العنوان': 'Address',
        'العنوان بالتفصيل': 'Detailed address',
        'الموقع على الخريطة': 'Location on map',
        'تحديد موقعي': 'Use my location',
        'رقم الهاتف': 'Phone number',
        'البريد الإلكتروني': 'Email address',
        'الاسم الكامل': 'Full name',
        'محمد أحمد': 'Mohamed Ahmed',
        'الرقم القومي': 'National ID',
        'رقم الترخيص': 'License number',
        'رقم ترخيص المزاولة': 'Professional license number',
        'سنوات الخبرة': 'Years of experience',
        'التخصص': 'Specialty',
        'بيانات المريض': 'Patient details',
        'بيانات الممرضة': 'Nurse details',
        'رمز الوصول': 'Access code',
        'أدخل رمز الوصول وكلمة المرور للدخول إلى لوحة التحكم': 'Enter your access code and password to open the dashboard',
        'غير مصرح بالدخول لهذا القسم': 'You are not authorized to access this section',
        'إنشاء الحساب': 'Create account',
            'إنشاء حساب - قرّب': 'Create account - Qarrib',
            'ليس لديك حساب؟': 'Don’t have an account?',
            'لديك حساب بالفعل؟': 'Already have an account?',
            'قدم خدماتك واكسب المال': 'Provide care and earn money',
        'إنشاء حساب جديد': 'Create a new account',
        'اضغط لرفع صورة البطاقة': 'Click to upload an ID image',
        'اضغط لرفع صورة الترخيص': 'Click to upload a license image',
        'أي صورة أو ملف (حتى 10MB)': 'Any image or file (up to 10 MB)',
        'صورة البطاقة الشخصية': 'ID image',
        'صورة ترخيص المزاولة': 'Professional license image',
        'بانتظار التوثيق': 'Waiting for verification',
        'إدارة المرضى - أدمن': 'Manage patients - Admin',
        'إدارة الممرضات - أدمن': 'Manage nurses - Admin',
        'تسجيل مريض - أدمن': 'Register patient - Admin',
        'تسجيل ممرضة - أدمن': 'Register nurse - Admin',
        'تسجيل المريض': 'Patient registration',
        'تسجيل الممرضة': 'Nurse registration',
        'طلبات التوثيق': 'Verification requests',
        'التوثيق': 'Verification',
        'الطلبات - أدمن': 'Orders - Admin',
        'الطلبات المتاحة - قرّب': 'Available requests - Qarrib',
        'طلباتي - قرّب': 'My orders - Qarrib',
        'طلب خدمة - قرّب': 'Request service - Qarrib',
        'المحفظة - قرّب': 'Wallet - Qarrib',
        'المحفظة - ممرض': 'Wallet - Nurse',
        'العروض - قرّب': 'Offers - Qarrib',
        'تتبع الممرض - قرّب': 'Track nurse - Qarrib',
        'المدفوعات': 'Payments',
        'المدفوعات - أدمن': 'Payments - Admin',
        'المعاملات - أدمن': 'Transactions - Admin',
        'المستخدمين - أدمن': 'Users - Admin',
        'تعيين الأسعار - أدمن': 'Set prices - Admin',
        'الرسائل - قرّب': 'Messages - Qarrib',
        'الرسائل - ممرض': 'Messages - Nurse',
        'الشات - أدمن (مناقشة الممرضين)': 'Admin chat (nurse discussion)',
        'الشات (ممرض/مريض)': 'Chat (nurse/patient)',
        'غرفة الشات - أدمن': 'Admin chat room',
        'شات الإدارة مع الممرضين والمرضى': 'Admin chat with nurses and patients',
        'شات الطلب': 'Order chat',
        'فودافون كاش': 'Vodafone Cash',
        'انستا باي': 'InstaPay',
        'تحويل بنكي': 'Bank transfer',
        'شحن المحفظة عبر انستا باي': 'Top up wallet with InstaPay',
        'حوّل المبلغ إلى حساب التطبيق:': 'Transfer the amount to the app account:',
        'بعد التحويل أدخل المبلغ ورقم العملية بالأسفل، وسيضيف الأدمن الرصيد بعد التأكد.': 'After transferring, enter the amount and transaction reference below. The admin will add the balance after verification.',
        'رقم الحساب / المحفظة (يستلم عليه الأدمن لك الفلوس)': 'Account or wallet number (the admin receives your transfer here)',
        'رقم العملية (مرجع التحويل)': 'Transaction reference',
        'المبلغ (جنيه)': 'Amount (EGP)',
        'المبلغ المحوّل (جنيه)': 'Transferred amount (EGP)',
        'المبلغ المرسل (جنيه)': 'Amount sent (EGP)',
        'السعر (Q)': 'Price (EGP)',
        'الرصيد:': 'Balance:',
        'الرصيد المتاح': 'Available balance',
        'آخر العمليات': 'Recent transactions',
        'السحوبات المدفوعة': 'Paid withdrawals',
        'سحوبات معلقة': 'Pending withdrawals',
        'طلبات السحب من الممرضين (حوّل لرقم حسابه)': 'Nurse withdrawal requests (transfer to their account number)',
        'طلبات الشحن المعلقة': 'Pending top-up requests',
        '0 جنيه': 'EGP 0',
        'جنيه': 'EGP',
        'دقيقة': 'minute',
        '⚠️ حسابك قيد المراجعة. سيتم التواصل معك قريباً.': '⚠️ Your account is under review. We will contact you soon.',
        '⚠️ تم رفض إذن الموقع. استخدم الموقع الافتراضي.': '⚠️ Location permission was denied. Using the default location.',
        '⚠️ رمز الوصول غير صحيح': '⚠️ Incorrect access code',
        '❌ إلغاء': '❌ Cancel',
        'جميع الحقوق محفوظة © 2026': 'All rights reserved © 2026',
        'ℹ️ معلومات النسخة': 'ℹ️ Version information',
        'تمريض أطفال': 'Pediatric nursing',
        'تمريض عام': 'General nursing',
        'عناية مركزة': 'Critical care',
        'رعاية جروح': 'Wound care',
        'حقن ومحاليل': 'Injections and IV fluids',
        'تغيير جروح': 'Dressing changes',
        'فحص طبي': 'Medical checkup',
        'رعاية مسنين': 'Elder care',
        'تركيب محاليل': 'IV setup',
        'أخرى': 'Other',
        // --- New screens: permissions gate, plans, subscriptions, pro dashboards, bell alerts ---
        'الأذونات': 'Permissions',
        '🔐 الأذونات': '🔐 Permissions',
        'اشتراكات': 'Subscriptions',
        '💎 الاشتراكات': '💎 Subscriptions',
        'الخطط': 'Plans',
        'مجانية': 'Free',
        'احترافية': 'Pro',
        'مميزة': 'VIP',
        'الخطة الحالية': 'Current plan',
        'تخفيض': 'Downgrade',
        'اشترك': 'Subscribe',
        'السعر': 'Price',
        'شهرياً': '/month',
        'مكالمات غير محدودة': 'Unlimited calling',
        'مطابقة ذات أولوية': 'Priority matching',
        'دعم ذو أولوية': 'Priority support',
        'خط الإدارة الساخن 24/7': '24/7 admin hotline',
        'اتصل بالإدارة الآن': 'Call admin now',
        'استلمت المبلغ — إنهاء': 'Cash received — finish',
        'المبلغ المستلم': 'Received amount',
        'المبلغ المتوقع': 'Expected amount',
        'أدخل المبلغ المستلم أولاً': 'Enter the received amount first',
        'تم إنهاء الزيارة بعد استلام المبلغ': 'Visit ended after receiving the amount',
        'موقعك يُبث مباشرة للمريض والإدارة': 'Your location is broadcast live to the patient and admin',
        'المريض أوقف مشاركة موقعه المباشر': 'The patient paused live live-location sharing',
        'الممرض أوقف مشاركة موقعه المباشر': 'The nurse paused live location sharing',
        'مشاركة الموقع المباشر': 'Live location sharing',
        'الاتصال معطل لهذا الحساب من الإدارة': 'Calling is disabled for this account by admin',
        'لا يوجد رقم مسجل': 'No registered number',
        'السماح': 'Enable',
        'مطلوب': 'Needed',
        'تم السماح': 'Allowed ✓',
        'لاحقاً': 'Later',
        'تفعيل المطلوب': 'Enable required',
        'إشعار قانوني لأذونات التطبيق': 'App permissions — legal notice',
        'موقع': 'Location',
        'المعرض / الصور': 'Gallery / Photos',
        'اتصال': 'Calling',
        'إشعارات': 'Notifications',
        'الشروط والخصوصية': 'Terms & privacy',
        'حفظ': 'Save',
        'بحث': 'Search',
        'كل الأدوار': 'All roles',
        'المرضى': 'Patients',
        'الممرضون': 'Nurses',
        'المشرفون': 'Admins',
        'تم الحفظ للمستخدم': 'Saved for user',
        'اعتماد الموقع المباشر': 'Approve live location',
        'حفظ الأذونات': 'Save permissions',
        'لا يوجد مستخدمون': 'No users found',
        'أسعار الخطط': 'Plan prices',
        'طلبات': 'Requests',
        'تحديث': 'Refresh',
        'الموافقة والتفعيل': 'Approve & activate',
        'رفض': 'Reject',
        'تم تحديث الأسعار': 'Prices updated',
        'تنبيه جديد': 'New notification',
        'طلب خدمة جديد': 'New service request',
        'تحديث على الطلب': 'Order update',
        'تم تحديث الأذونات': 'Permissions updated',
        'اضغط للعرض': 'Tap to view →',
        'بدأت الخدمة': 'Service started',
        'تم إنهاء الخدمة': 'Service completed',
        'تم إلغاء الطلب': 'Order was cancelled',
        'مرحباً بعودتك': 'Welcome back',
        'متصل ●': 'Online ●',
        'ابحث عن طلبات': 'Find requests',
        'رصيد المحفظة': 'Wallet balance',
        'سحب': 'Withdraw →',
        'الزيارات النشطة': 'Active visits',
        'إجمالي الأرباح': 'Total earnings',
        'لا توجد زيارات نشطة': 'No active visits',
        'تتبع المريض': 'Track patient 📍',
        'أدوات احترافية': 'Pro tools',
        'حساب استلام الأرباح': 'Payout account',
        'لم يحدد بعد': 'not set',
        'تم حفظ حساب الاستلام': 'Payout account saved',
        'اليوم': 'Today',
        'شات الدعم': 'Support chat',
        'طلبات جديدة بالقرب منك': 'New requests near you',
        'مركز التحكم': 'Control center',
        'إيرادات المنصة': 'Platform revenue',
        'أدوات الإدارة': 'Management tools',
        'نظرة على الأموال': 'Money overview',
        'تم تحديث الأرباح': 'Earnings refreshed',
        'العودة إلى المجانية': 'Back to Free',
        'الرجوع إلى المجانية': 'Downgrade to Free',
        'اشتراك': 'Subscription',
        'فشل': 'Failed',
        'تمت إعادة التعيين': 'Reset done',
        'ℹ️ النسخة': 'ℹ️ Version',
        'سحوبات مدفوعة': 'Withdrawals paid',
        'شحن معلق': 'Topups pending',
        'فتح المدفوعات': 'Open payments',
        'زيارات الرعاية، في طريقك': 'Care visits, on your way.',
        'ابحث عن طلبات بالقرب مني': 'Find requests near me',
        'طلبات جديدة': 'New requests',
        'حفظ الأسعار': 'Save prices',
        'سعر الاحترافية': 'Pro price',
        'سعر المميزة': 'VIP price',
        'تم قبول الزيارة': 'Visit accepted',
        'جارٍ فتح تتبع المريض المباشر': 'Opening live patient tracking…',
        'تم إشعار المريض والإدارة بتنبيه الجرس': 'Patient and admin were notified with a bell alert',
        'تم استلام المبلغ': 'Cash received',
        'انتهت الزيارة — طُلب من المريض التقييم بالنجوم': 'Visit ended — patient was asked to rate with stars',
        'تم حفظ الأذونات': 'Permissions saved',
        'تم تحديث بوابات الأجهزة لكل المستخدمين': 'Device gates updated for all users',
        'خطتك الحالية': 'Your current plan: ',
        'الترقية إلى الاحترافية 250 / المميزة 500': 'Upgrade to Pro 250 / VIP 500 →',
        'مميز · اتصل بالإدارة 24/7': '👑 VIP · Call admin 24/7',
        'مشاركة الموقع المباشر: مفعّلة (اضغط للإيقاف)': 'Live location sharing: ON (tap to pause)',
        'مشاركة الموقع المباشر: متوقفة (اضغط للتفعيل)': 'Live location sharing: OFF (tap to enable)',
        'أوقف الممرض مشاركة موقعه المباشر — ستصلك تنبيهات الجرس عند الوصول. اتصال': 'The nurse paused live location sharing — you will still get bell alerts on arrival. Call: ',
        'الاتصال معطل لهذا الممرض من الإدارة': 'Calling is disabled for this nurse by admin',
        'طلب جديد متاح — افتح الطلبات الآن': 'A new request is available — open requests now',
        'حدّثت الإدارة أذونات حسابك': 'Admin updated your account permissions',
        'تحكم في من يستطيع ماذا — بدون أكواد': 'Control who can do what — no code needed',
        'أذونات الأجهزة المطلوبة لكل دور (بوابة قانونية)': 'Required device permissions per role (legal gate)',
        'أذونات الميزات لكل مستخدم (أضف / أزل كما تشاء)': 'Per-user feature permissions (add / remove as you like)',
        'ابحث بالاسم / الهاتف / البريد': 'Search name / phone / email',
        'ابحث لتحميل المستخدمين': 'Search to load users…',
        'تم حفظ متطلبات الأذونات': 'Permission requirements saved',
        'مجاني / احترافي / مميز — فوترة شهرية': 'Free / Pro / VIP — monthly billing',
        'أسعار الخطط (جنيه / شهر)': 'Plan prices (EGP / month)',
        'معلق': 'pending',
        'نشط': 'active',
        'مرفوض': 'rejected',
        'منتهي': 'expired',
        'ملغي': 'cancelled',
        'جارٍ الطلب': 'Requesting…',
        '(مطلوب)': '(required)',
        'تم إنهاء الخدمة — قيّم بالنجوم': 'Service completed — please rate with stars ⭐',
        'قبل ممرض — تتبع مباشرة الآن': 'A nurse accepted — track live now',
        'تحويل انستا باي': 'InstaPay transfer',
        'لا توجد زيارات نشطة. اتصل بالإنترنت واقبل طلباً': 'No active visits. Go online and accept a request.',
        'لا توجد طلبات الآن — ستصلك تنبيه الجرس عند وصول طلب': 'No requests right now — you will get a 🔔 bell alert when one arrives.'
    };

    var prefixes = [
        ['مرحباً بك', 'Welcome'],
        ['مرحباً', 'Hello'],
        ['فشل تحميل البيانات', 'Failed to load data'],
        ['لا توجد طلبات نشطة', 'There are no active requests'],
        ['رقم الطلب', 'Order'],
        ['الخدمة:', 'Service:'],
        ['الحالة:', 'Status:'],
        ['المبلغ:', 'Amount:'],
        ['الرصيد:', 'Balance:'],
        ['Error:', 'Error:']
    ];

    var textOriginals = new WeakMap();
    var textRendered = new WeakMap();
    var attributeOriginals = new WeakMap();
    var attributeRendered = new WeakMap();
    var language = 'ar';
    var button;

    function translate(value, targetLanguage) {
        var sourceLanguage = targetLanguage === 'en' ? 'ar' : 'en';
        var trimmed = value.trim();
        var translated = sourceLanguage === 'ar' ? translations[trimmed] : reverseTranslations[trimmed];

        if (!translated) {
            for (var i = 0; i < prefixes.length; i += 1) {
                var from = sourceLanguage === 'ar' ? prefixes[i][0] : prefixes[i][1];
                var to = sourceLanguage === 'ar' ? prefixes[i][1] : prefixes[i][0];
                if (trimmed.indexOf(from) === 0) {
                    translated = to + trimmed.slice(from.length);
                    break;
                }
            }
        }

        if (!translated) {
            var sourceMap = sourceLanguage === 'ar' ? translations : reverseTranslations;
            var sourcePhrases = Object.keys(sourceMap).sort(function (a, b) {
                return b.length - a.length;
            });
            var replacedPhrase = false;
            translated = trimmed;
            for (var phraseIndex = 0; phraseIndex < sourcePhrases.length; phraseIndex += 1) {
                var phrase = sourcePhrases[phraseIndex];
                if (translated.indexOf(phrase) !== -1) {
                    translated = translated.split(phrase).join(sourceMap[phrase]);
                    replacedPhrase = true;
                }
            }
            if (!replacedPhrase) translated = undefined;
        }

        if (!translated) return value;
        var leading = value.match(/^\s*/)[0];
        var trailing = value.match(/\s*$/)[0];
        return leading + translated + trailing;
    }

    var reverseTranslations = {};
    Object.keys(translations).forEach(function (arabic) {
        reverseTranslations[translations[arabic]] = arabic;
    });

    function translateTextNode(node) {
        var current = node.nodeValue;
        var original = textOriginals.get(node);
        var lastRendered = textRendered.get(node);
        if (original === undefined || current !== lastRendered) {
            original = current;
            textOriginals.set(node, original);
        }
        var next = translate(original, language);
        if (next !== current) {
            textRendered.set(node, next);
            node.nodeValue = next;
        } else {
            textRendered.set(node, current);
        }
    }

    function translateAttributes(element) {
        var names = ['placeholder', 'title', 'aria-label', 'alt'];
        var originals = attributeOriginals.get(element) || {};
        var rendered = attributeRendered.get(element) || {};

        names.forEach(function (name) {
            if (!element.hasAttribute(name)) return;
            var current = element.getAttribute(name);
            if (originals[name] === undefined || current !== rendered[name]) {
                originals[name] = current;
            }
            var next = translate(originals[name], language);
            if (next !== current) element.setAttribute(name, next);
            rendered[name] = next;
        });

        attributeOriginals.set(element, originals);
        attributeRendered.set(element, rendered);
    }

    function translateTree(root) {
        if (!root) return;
        if (root.nodeType === 3) {
            translateTextNode(root);
            return;
        }
        if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
        if (root.nodeType === 1) translateAttributes(root);

        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        var node;
        while ((node = walker.nextNode())) translateTextNode(node);
        if (root.querySelectorAll) {
            var elements = root.querySelectorAll('*');
            for (var i = 0; i < elements.length; i += 1) translateAttributes(elements[i]);
        }
    }

    function updateButton() {
        button.textContent = language === 'ar' ? 'English' : 'العربية';
        button.setAttribute('aria-label', language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
        button.title = language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية';
    }

    function setLanguage(nextLanguage) {
        language = nextLanguage === 'en' ? 'en' : 'ar';
        window.qarribLanguage = language;
        window.formatCurrency = function (amount) {
            return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ar-EG', {
                style: 'currency',
                currency: 'EGP'
            }).format(amount);
        };
        window.formatDate = function (dateString) {
            return new Date(dateString).toLocaleDateString(language === 'en' ? 'en-US' : 'ar-EG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };
        document.documentElement.lang = language;
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
        try { localStorage.setItem('qarrib-language', language); } catch (error) {}
        translateTree(document.documentElement);
        updateButton();
    }

    function initialize() {
        if (document.getElementById('qarrib-language-toggle')) return;

        try {
            language = localStorage.getItem('qarrib-language') || document.documentElement.lang || 'ar';
        } catch (error) {
            language = document.documentElement.lang || 'ar';
        }
        language = language === 'en' ? 'en' : 'ar';

        button = document.createElement('button');
        button.id = 'qarrib-language-toggle';
        button.type = 'button';
        button.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;border:0;border-radius:999px;padding:10px 16px;background:#0f766e;color:#fff;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 14px rgba(15,23,42,.22);cursor:pointer;';
        button.addEventListener('click', function () {
            setLanguage(language === 'ar' ? 'en' : 'ar');
        });
        document.body.appendChild(button);

        setLanguage(language);
        new MutationObserver(function (records) {
            records.forEach(function (record) {
                if (record.type === 'characterData') {
                    translateTextNode(record.target);
                } else {
                    for (var i = 0; i < record.addedNodes.length; i += 1) {
                        translateTree(record.addedNodes[i]);
                    }
                    if (record.type === 'attributes') translateAttributes(record.target);
                }
            });
        }).observe(document.documentElement, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['placeholder', 'title', 'aria-label', 'alt']
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
}());
