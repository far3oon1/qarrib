// Single source of truth for platform commission.
// Admin takes this % automatically, nurse gets the rest.
// Example: service 200 at 20% -> admin 40, nurse 160.
//
// Override without code change:
//   ADMIN_COMMISSION_PERCENT=15  (0-90 allowed)
const DEFAULT_COMMISSION_PERCENT = 20;

function getCommissionRate() {
  const raw = Number(process.env.ADMIN_COMMISSION_PERCENT);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 90) return raw;
  return DEFAULT_COMMISSION_PERCENT;
}

function resolveRate(existing) {
  const n = Number(existing);
  if (Number.isFinite(n) && n > 0) return n;
  return getCommissionRate();
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function splitAmount(total) {
  const amount = Number(total) || 0;
  const rate = getCommissionRate();
  const commission = round2(amount * (rate / 100));
  const nurseEarnings = round2(amount - commission);
  return { rate, commission, nurseEarnings, platformFee: commission };
}

module.exports = {
  DEFAULT_COMMISSION_PERCENT,
  getCommissionRate,
  resolveRate,
  splitAmount,
  round2,
};
