// Single source of truth mapping the frontend service-type keys
// (request-service.html data-value) to Service documents. Used by order
// creation, admin set-price and seeding so all three always agree.
const SERVICE_PRICE_CATALOG = {
  injection: { name: 'injection', nameAr: 'حقن ومحاليل', category: 'injection' },
  wound: { name: 'wound_care', nameAr: 'رعاية جروح', category: 'wound_care' },
  elderly: { name: 'elderly_care', nameAr: 'رعاية مسنين', category: 'elderly_care' },
  iv: { name: 'iv_therapy', nameAr: 'تركيب محاليل', category: 'iv_therapy' },
  physio: { name: 'physiotherapy', nameAr: 'علاج طبيعي', category: 'physiotherapy' },
  other: { name: 'other', nameAr: 'تمريض منزلي', category: 'other' }
};

// Retired for now: medical checkup needs a doctor, which the app doesn't
// have. Any request resolving to it is rejected (see assertServiceAllowed).
const RETIRED_SERVICES = ['checkup'];

const resolveServiceType = (key) => SERVICE_PRICE_CATALOG[String(key || '').toLowerCase()] || null;

function assertServiceAllowed(serviceDoc, rawKey) {
  const k = String(rawKey || '').toLowerCase();
  const n = serviceDoc ? String(serviceDoc.name || '').toLowerCase() : '';
  const ar = serviceDoc ? String(serviceDoc.nameAr || '') : '';
  if (RETIRED_SERVICES.includes(k) || RETIRED_SERVICES.includes(n) || ar === 'فحص طبي') {
    const ApiError = require('./ApiError');
    throw new ApiError(400, 'خدمة الفحص الطبي غير متاحة حالياً — لا يوجد طبيب / Medical checkup is unavailable for now');
  }
}

module.exports = { SERVICE_PRICE_CATALOG, resolveServiceType, RETIRED_SERVICES, assertServiceAllowed };
