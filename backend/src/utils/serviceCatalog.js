// Single source of truth mapping the frontend service-type keys
// (request-service.html data-value) to Service documents. Used by order
// creation, admin set-price and seeding so all three always agree.
const SERVICE_PRICE_CATALOG = {
  injection: { name: 'injection', nameAr: 'حقن ومحاليل', category: 'injection' },
  wound: { name: 'wound_care', nameAr: 'رعاية جروح', category: 'wound_care' },
  checkup: { name: 'checkup', nameAr: 'فحص طبي', category: 'vital_signs' },
  elderly: { name: 'elderly_care', nameAr: 'رعاية مسنين', category: 'elderly_care' },
  iv: { name: 'iv_therapy', nameAr: 'تركيب محاليل', category: 'iv_therapy' },
  physio: { name: 'physiotherapy', nameAr: 'علاج طبيعي', category: 'physiotherapy' },
  other: { name: 'other', nameAr: 'تمريض منزلي', category: 'other' }
};

const resolveServiceType = (key) => SERVICE_PRICE_CATALOG[String(key || '').toLowerCase()] || null;

module.exports = { SERVICE_PRICE_CATALOG, resolveServiceType };
