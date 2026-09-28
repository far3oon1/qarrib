// Haversine distance helper (shared by nurse matching + request sorting).
const toRad = (d) => (d * Math.PI) / 180;

const distanceKm = (a, b) => {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const R = 6371;
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(Number(a.lat))) * Math.cos(toRad(Number(b.lat))) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

module.exports = { distanceKm, toRad };
