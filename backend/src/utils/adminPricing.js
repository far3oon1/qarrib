// Admin-pricing gate: a nurse may not take any service before the admin
// has set a price for it. The authoritative price lives on Service.basePrice
// (see admin set-price). Orders created through /orders/create already carry
// it; this guard also covers legacy / direct-created orders.
const ApiError = require('./ApiError');

const NOT_PRICED_MESSAGE = 'لا يمكن قبول هذا الطلب قبل أن تحدد الإدارة سعر الخدمة';

function adminPriceOf(service) {
  const price = Number(service && service.basePrice);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function assertAdminPriced(service, message) {
  if (!service || service.isActive === false || adminPriceOf(service) == null) {
    throw new ApiError(400, message || NOT_PRICED_MESSAGE);
  }
  return adminPriceOf(service);
}

module.exports = { adminPriceOf, assertAdminPriced, NOT_PRICED_MESSAGE };
