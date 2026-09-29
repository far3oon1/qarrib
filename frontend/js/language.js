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
        'تتبع المريض 📍': 'Track patient 📍',
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
        '📍 مشاركة الموقع المباشر: مفعّلة (اضغط للإيقاف)': '📍 Live location sharing: ON (tap to pause)',
        '📍 مشاركة الموقع المباشر: متوقفة (اضغط للتفعيل)': '📍 Live location sharing: OFF (tap to enable)',
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
        'لا توجد طلبات الآن — ستصلك تنبيه الجرس عند وصول طلب': 'No requests right now — you will get a 🔔 bell alert when one arrives.',
        // --- Round 2: every remaining English string on patient/nurse/admin screens ---
        'الممرض في الطريق إليك': 'Your nurse is on the way',
        'جارٍ تحميل الخريطة…': 'Loading map…',
        'جارٍ التحميل…': 'Loading…',
        'جارٍ تحميل العروض…': 'Loading offers…',
        'جارٍ تحميل خطتك…': 'Loading your plan…',
        'المسافة:': 'Distance:',
        'كم · الوقت المتوقع:': 'km · ETA:',
        'دقائق': 'minutes',
        'طوارئ': 'Emergency',
        'رجوع': '← Back',
        'تم الوصول': 'Arrived',
        'في الطريق': 'On the way',
        'اكتملت الزيارة والتقرير': 'Visit completed & report',
        'مقبول': 'Accepted',
        'قيد المراجعة': 'Under review',
        'مفتوح': 'Open',
        'تم التعيين': 'Assigned',
        'لا توجد طلبات نشطة.': 'No active orders.',
        'اطلب الآن': 'Request now',
        'بانتظار عروض الممرضين…': 'Waiting for nurse offers…',
        'لا توجد عروض بعد.': 'No offers yet.',
        'عروض أسعار الممرضين:': 'Nurse price offers:',
        'السعر المقترح:': 'Suggested price:',
        'اقبل وافتح للممرضين': 'Accept & open to nurses',
        'قبول': 'Accept',
        'الدفع (': 'Payment (',
        'ادفع من المحفظة': 'Pay from wallet',
        'مرجع انستا باي': 'InstaPay reference',
        'إنهاء الخدمة كمكتملة': 'End service as completed',
        'إلغاء الزيارة': 'Cancel visit',
        'قيّم ممرضك': 'Rate your nurse',
        'ملاحظاتك (تُرسل للإدارة أيضاً)': 'Your feedback (sent to admin too)',
        'إرسال التقييم': 'Send feedback',
        'يصل قريباً ·': 'Arrives soon ·',
        'تم قبول السعر!': 'Price accepted!',
        'تم الدفع! المبلغ محجوز ضماناً.': 'Paid! Amount held in escrow.',
        'فشل الدفع': 'Payment failed',
        'تم تسجيل التحويل!': 'Transfer recorded!',
        'اكتملت الخدمة! قيّم ممرضك.': 'Service completed! Please rate your nurse.',
        'شكراً! تم إرسال تقييمك.': 'Thank you! Feedback sent.',
        'تم رفض إذن الموقع. استخدام الموقع الافتراضي.': 'Location permission denied. Using default location.',
        'تم القبول! طلبك ظاهر الآن للممرضين.': 'Accepted! Your request is now visible to nurses.',
        'اختر خطتك — فوترة شهرية (30 يوماً)': 'Choose your plan — billed monthly (30 days)',
        'رعاية تمريضية حتى باب منزلك.': 'Nursing care, at your door.',
        'الخدمات': 'SERVICES',
        'رعاية المسنين': 'Elderly care',
        'الحقن والمحاليل': 'Injections & IV',
        'فحص العلامات الحيوية': 'Vitals check',
        'ما بعد الجراحة': 'Post-surgery',
        'المزيد من الخدمات': 'More services',
        'زياراتي': 'My visits',
        'الزيارات': 'Visits',
        'عروض ممرضين جديدة': 'New nurse offers',
        'عرض الكل': 'View all',
        'عرض كل العروض': 'View all offers',
        'الحالية': 'CURRENT',
        'طلب ممرض': 'Request a nurse',
        'تتبع مباشر للممرض/المريض': 'Live nurse/patient tracking',
        'الدفع بالمحفظة وانستا باي': 'Wallet & InstaPay payments',
        'التقييم بالنجوم والملاحظات': 'Rate with stars & feedback',
        'مكالمات غير محدودة (أرقام الممرض/المريض)': 'Unlimited calling (nurse/patient numbers)',
        'مطابقة ذات أولوية (الأقرب أولاً)': 'Priority matching (nearest first)',
        'أولوية رفع الصور': 'Priority photo uploads',
        'دعم ذو أولوية (8ص–12م)': 'Priority support (8am–12am)',
        'خصم 5% على الخدمات': '5% service discount',
        'الاتصال بالخط الساخن للإدارة 24/7': '24/7 admin hotline calling',
        'مدير حساب مخصص': 'Dedicated account manager',
        'إعادة جدولة مجانية': 'Free rescheduling',
        'أولوية السحوبات': 'Priority withdrawals',
        '👑 شارة مميزة': '👑 VIP badge',
        'خصم 10% على الخدمات': '10% service discount',
        'الدعم': 'Support',
        '(نصف المميز)': '(half of VIP)',
        'الاتصال بالإدارة 24 ساعة (حصري)': 'Admin 24-hour calling (exclusive)',
        'الدعم 24/7': 'Support 24/7',
        'الدعم 9ص–5م': 'Support 9am–5pm',
        '👑 الخط الساخن للإدارة 24/7 للمميزين': '👑 VIP 24/7 admin hotline',
        'بصفتك مميزاً يمكنك الاتصال بالإدارة في أي وقت — خط الدعم ذو الأولوية.': 'As a VIP you can call the admin anytime, day or night — priority support line.',
        '📞 اتصل بالإدارة الآن (24/7)': '📞 Call admin now (24/7)',
        '💳 ادفع من رصيد المحفظة فوراً، أو عبر تحويل انستا باي (تفعّله الإدارة بعد التحقق). ألغِ في أي وقت — تعود إلى المجانية.': '💳 Pay from wallet balance instantly, or via InstaPay transfer (admin activates after verifying). Cancel anytime — you drop back to Free.',
        'مرجع انستا باي (لانستا باي فقط)': 'InstaPay reference (for InstaPay only)',
        'جرّب قرّب — اطلب ممرضاً، تتبع، تحدث وادفع.': 'Try Qarrib — request a nurse, track, chat and pay.',
        'نصف ميزات التميز — للمستخدمين الدائمين.': 'Half of the premium features — for regular users.',
        'كل الميزات + الخط الساخن للإدارة 24/7.': 'All features + 24/7 admin hotline calling.',
        'تم بنجاح': 'Done',
        'احترافي': 'PRO',
        'مميز': 'VIP',
        'مجاني': 'FREE',
        'رصيد المحفظة': 'Wallet balance',
        'الزيارات النشطة — تتبع المريض والإنهاء عند الاستلام': 'Active visits — track patient & end on cash',
        'أدوات احترافية': 'Pro tools',
        'غير محدد': 'not set',
        'الرقم / الآيبان': 'Number / IBAN',
        'شات الدعم (الإدارة)': 'Support chat (admin)',
        'طلبات جديدة بالقرب منك': 'New requests near you',
        'طلبات جديدة': 'New requests',
        'ابحث عن طلبات': 'Find requests',
        'طلبات': 'Requests',
        'زيارة': 'Visit',
        'لم يُقيّم بعد': 'Not rated yet',
        'التقييمات': 'Feedbacks',
        '⭐ التقييمات': '⭐ Feedbacks',
        'التقارير': 'Reports',
        'تتبع المريض': 'Track patient',
        'الأذونات': 'Permissions',
        'تحديث الأرباح': 'Refresh earnings',
        'الرسوم:': 'Fees:',
        '· الممرضون:': '· Nurses:',
        'إعادة تعيين المدفوعات': 'Reset payments',
        'مركز التحكم.': 'Control center.',
        'الاشتراكات': 'Subscriptions',
        'أسعار الممرضين': 'Nurse prices',
        '🔔 تنبيه الجرس مع صوت لكل طلب جديد ودفعة وتقييم — على الويب وسطح المكتب والموبايل.': '🔔 You get a bell popup + sound for every new request, payment and feedback — on web, desktop and mobile.',
        '⚠️ حسابك قيد المراجعة — سنعلمك عند الموافقة.': '⚠️ Account under review — you will be notified on approval.',
        '⚠️ الحساب قيد المراجعة.': '⚠️ Account under review.',
        'الحساب': 'Profile',
        'اكتملت الخدمة': 'Service completed',
        'عند التفعيل، يجب على الممرض/المريض السماح به على الموبايل أو iOS أو الويب قبل استخدام التطبيق. الموقع = التتبع المباشر · المعرض = صور الخدمات · الاتصال = أزرار الاتصال · الإشعارات = تنبيهات الجرس.': 'When required, the nurse/patient must Allow it on mobile, iOS or web before using the app. Location = live tracking · Gallery = service images · Calling = call buttons · Notifications = bell alerts.',
        'الصلاحية': 'Permission',
        'مطلوب للمريض': 'Patient required',
        'مطلوب للممرض': 'Nurse required',
        'عنوان الإشعار القانوني': 'Legal notice title',
        'نص الإشعار القانوني (يظهر في التطبيق)': 'Legal notice text (shown in app)',
        'حفظ الكل': 'Save all',
        'عرض الطلبات (صلاحية)': 'View orders',
        'قبول الطلبات (صلاحية)': 'Accept orders',
        'إرسال الأسعار (صلاحية)': 'Submit prices',
        'بدء الخدمة (صلاحية)': 'Start service',
        'إنهاء الخدمة (صلاحية)': 'End service',
        'التتبع المباشر (صلاحية)': 'Live tracking',
        'الاتصال بالمريض (صلاحية)': 'Call patient',
        'الاتصال بالممرض (صلاحية)': 'Call nurse',
        'تنبيهات الجرس (صلاحية)': 'Bell alerts',
        'مشاركة الموقع (صلاحية)': 'Share location',
        'رفع الصور (صلاحية)': 'Upload photos',
        'سحب الأرباح (صلاحية)': 'Withdraw',
        'الموقع': 'location',
        'المعرض': 'gallery',
        'المكالمات': 'calling',
        'موقع': 'Location',
        'معرض': 'Gallery',
        'مكالمات': 'Calling',
        'شروط': 'Terms',
        'الشروط': 'terms',
        'لا توجد اشتراكات': 'No subscriptions',
        'يحتاج قرّب الموقع (التتبع المباشر)، والمعرض (صور الخدمات)، والاتصال (التواصل على الرقم المسجل) والإشعارات. على أندرويد وiOS سيطلب منك النظام السماح. مطلوب لعمل الخدمة بأمان وقانونية.': 'Qarrib needs location (live tracking), gallery (service images), calling (contact on the registered number) and notifications. On Android & iOS the system will ask you to Allow. Required for the service to work safely and legally.',
        'أنت على iOS: اضغط سماح عند ظهور حوار النظام. يمكنك تغييرها لاحقاً من الإعدادات ← قرّب.': 'You are on iOS: tap Allow when the system dialog appears. You can change this later in Settings → Qarrib.',
        'أنت على أندرويد: اضغط سماح عند ظهور حوار النظام. يمكنك تغييرها لاحقاً من الإعدادات ← التطبيقات ← قرّب ← الأذونات.': 'You are on Android: tap Allow when the system dialog appears. You can change this later in Settings → Apps → Qarrib → Permissions.',
        'أنت على الويب: سيطلب منك المتصفح الموقع والإشعارات. المعرض والاتصال يُمنحان داخل التطبيق.': 'You are on web: your browser will ask for Location and Notifications. Gallery and Calling are granted inside the app.',
        'التتبع المباشر: يرى المريض الممرض على الخريطة ويرى الممرض عنوان المريض. مطلوب للسلامة وتقدير الوصول.': 'Live tracking: patient sees the nurse on the map and the nurse sees the patient address. Required for safety and arrival estimates.',
        'ارفع صور الخدمة ومستندات التوثيق (الهوية / ترخيص التمريض).': 'Upload service images and verification documents (ID / nursing license).',
        'اتصل بالممرض / المريض على الرقم المسجل، أو أزرار الاتصال داخل التطبيق.': 'Call the nurse / patient on the registered number, or in-app call buttons.',
        'تنبيهات جرس فورية عند طلب خدمة أو قبولها أو دفعها أو إتمامها.': 'Instant bell alerts when a service is requested, accepted, paid or completed.',
        'أنت توافق على أن الموقع والصور ورقم الهاتف تُستخدم فقط لتقديم خدمة التمريض.': 'You accept that location, photos and phone number are used only to deliver the nursing service.',
        '= كل شيء +': '= everything +',
        '= مطابقة ذات أولوية، مكالمات غير محدودة، دعم ذو أولوية 8ص–12م، خصم 5% (نصف المميز).': '= priority matching, unlimited calls, priority support 8am–12am, 5% discount (half of premium).',
        'نشطة': 'Active',
        'الميزات:': 'Features:',
        'ويب': 'Web',
        'مطابقة ذات أولوية': 'Priority matching',
        'مكالمات غير محدودة': 'Unlimited calling',
        'دعم ذو أولوية': 'Priority support',
        '(نصف المميز)': '(half of premium)',
        'كل شيء في Pro': 'everything in Pro',
        // --- Nurse-only plans (Free Nurse / VIP Nurse trusted), InstaPay flow, enforcement ---
        'ممرض مميز': 'VIP Nurse',
        'ممرض مجاني · ممرض مميز': 'Free Nurse · VIP Nurse',
        'شارة الموثوق ✅ — المرضى يثقون بك أولاً، تتصدر دائماً، وتحصل على زيارات أكثر.': 'Trusted badge ✅ — patients trust you first, rank first, get more visits.',
        'قبول الطلبات': 'Accept orders',
        'عرض المحفظة': 'Wallet view',
        '✅ شارة ممرض موثوق — المرضى يثقون بك أولاً': '✅ TRUSTED nurse badge — patients trust you first',
        '🥇 الترتيب أولاً في قوائم الممرضين': '🥇 Rank first in nurse lists',
        'أنت ممرض موثوق': 'You are a TRUSTED nurse',
        'يرى المرضى شارة الموثوق على اسمك وتتصدر كل القوائم.': 'Patients see the trusted badge on your name and you rank first in every list.',
        'كن ممرضاً موثوقاً VIP بـ 500 جنيه': 'Become VIP Trusted nurse 500 EGP →',
        'مميز ✅ موثوق': 'VIP ✅ Trusted',
        '✅ موثوق': '✅ Trusted',
        'موثّق': 'Trusted',
        'ادفع عبر انستا باي لهذا الرقم': 'Pay via InstaPay to this number',
        'الخطوة 1 — حوّل سعر الخطة إلى رقم قرّب الرسمي. الخطوة 2 — أدخل مرجع العملية بالأسفل واضغط تحويل انستا باي. الخطوة 3 — تتحقق الإدارة وتفعّل خطتك (يصلك تنبيه جرس).': 'Step 1 — transfer the plan price to the official Qarrib number. Step 2 — enter the amount reference below and press InstaPay transfer. Step 3 — admin verifies and activates your plan (you get a bell alert).',
        'تم نسخ الرقم: ': 'Number copied: ',
        'أو ادفع فوراً من رصيد المحفظة بزر المحفظة على أي خطة. ألغِ في أي وقت — تعود للمجانية.': 'Or pay instantly from wallet balance with the wallet button on any plan. Cancel anytime — you drop back to Free.',
        'سعر الممرض المميز': 'VIP Nurse price',
        'فشل تحميل الخطط': 'Failed to load plans',
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
