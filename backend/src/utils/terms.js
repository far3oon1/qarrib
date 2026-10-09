// Liability waiver / Terms of Use for Qarrib ("قرّب").
// The app is a HELPER / facilitation tool only — not a hospital, clinic or
// emergency service, and not a party to the nurse↔patient visit. Every
// patient AND every nurse must accept these terms BEFORE registering, and is
// reminded of them on EVERY sign-in. Bump TERMS_VERSION whenever the text
// changes so old acceptances become stale automatically.
const TERMS_VERSION = '2.0';

const TERMS_AR = `شروط الاستخدام وإخلاء المسؤولية الكامل — تطبيق قرّب (الإصدار ${TERMS_VERSION})

1) التطبيق وسيلة مساعدة فقط: قرّب منصة تقنية لتسهيل التواصل في الرعاية المنزلية البسيطة، وليس مستشفى أو عيادة أو جهة طبية، وليس طرفاً في أي اتفاق بين المريض والممرض.

2) إخلاء كامل من أي شيء: يخلي تطبيق قرّب مسؤوليته تماماً وكلياً عن أي شيء يحدث قبل الخدمة أو أثناءها أو بعدها — بما في ذلك أي أخطاء أو أضرار أو خسائر أو نزاعات من أي مريض أو ممرض أو أي طرف آخر، سواء عن قصد أو عن غير قصد.

3) لا مساءلة قانونية: باستخدامك التطبيق فأنت توافق على عدم الرجوع على التطبيق أو إدارته أو القائمين عليه بأي مطالبة أو شكوى أو دعوى قضائية أو مساءلة قانونية من أي نوع وبأي سبب كان، وتتحمل وحدك كامل المسؤولية عن أفعالك وقراراتك.

4) الحالات البسيطة فقط: الخدمة مخصصة للأشياء البسيطة (حقن، غيار جروح، متابعة، رعاية مسنين...) لتسهيل الأمور على الناس — وليست بديلاً عن الكشف الطبي أو التشخيص أو العلاج.

5) حالات الطوارئ: عند أي حالة طارئة أو خطيرة توجه فوراً للطوارئ أو المستشفى المختص ولا تعتمد على التطبيق إطلاقاً.

6) تحقق بنفسك: على المريض التأكد من هوية الممرض وترخيصه قبل بدء الخدمة، وعلى الممرض التأكد من صحة بيانات الطلب قبل القبول — التطبيق لا يضمن أي طرف.

7) استخدام على مسؤوليتك: استمرارك في التسجيل أو الدخول أو استخدام التطبيق يعني موافقتك الكاملة والنهائية على كل ما سبق.`;

const TERMS_EN = `Full Terms of Use & Liability Waiver — Qarrib App (v${TERMS_VERSION})

1) Helper tool only: Qarrib is a technical platform that helps patients and nurses connect for simple home care. It is NOT a hospital, clinic, or medical authority, and is NOT a party to any agreement between patient and nurse.

2) Full waiver of everything: The Qarrib app fully and completely disclaims any and all liability for anything that happens before, during, or after the service — including any mistakes, harm, loss, or disputes caused by any patient, nurse, or any other party, whether intentional or not.

3) No legal accountability: By using the app you agree never to bring any claim, complaint, lawsuit, or legal action of any kind and for any reason against the app, its management, or its operators — you alone bear full responsibility for your own actions and decisions.

4) Simple cases only: The service is for simple, non-emergency help (injections, wound dressing, follow-ups, elderly care...) to make life easier — not a replacement for medical examination, diagnosis, or treatment.

5) Emergencies: In any urgent or serious case, go to the emergency room or the specialized hospital immediately — never rely on the app.

6) Verify yourself: Patients must verify the nurse's identity and license before the visit; nurses must verify the request details before accepting — the app guarantees neither party.

7) Use at your own risk: Continuing to register, sign in, or use the app means your full and final acceptance of everything above.`;

function termsAccepted(user) {
  if (!user) return false;
  const t = (user.consents && user.consents.terms) || {};
  return t.granted === true && String(t.version || '') === String(TERMS_VERSION);
}

function grantTerms(user) {
  if (!user.consents) user.consents = {};
  user.consents.terms = { granted: true, updatedAt: new Date(), version: TERMS_VERSION };
  return user;
}

module.exports = { TERMS_VERSION, TERMS_AR, TERMS_EN, termsAccepted, grantTerms };
