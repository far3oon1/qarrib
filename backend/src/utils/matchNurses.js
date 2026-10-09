// Uber/inDrive shortlist picker: 3-4 nearest approved nurses, online first.
// Falls back to random approved nurses when no GPS point is available.
const User = require('../models/User');
const { findNearestNurses } = require('./nearestNurses');

const MATCH_LIMIT_DEFAULT = 4;

async function pickMatchNurses({ lat, lng, limit = MATCH_LIMIT_DEFAULT, excludeIds = [] } = {}) {
  const excluded = new Set((excludeIds || []).map((x) => String(x)));
  const point = { lat: Number(lat), lng: Number(lng) };
  const hasPoint = Number.isFinite(point.lat) && Number.isFinite(point.lng);

  if (hasPoint) {
    const nearest = await findNearestNurses({ lat: point.lat, lng: point.lng, limit: limit + excluded.size + 8 });
    return nearest
      .filter((x) => !excluded.has(String(x.nurse._id)))
      .slice(0, limit)
      .map((x) => ({ nurse: x.nurse._id, distanceKm: Math.round(x.distanceKm * 10) / 10 }));
  }

  // No GPS: random approved nurses so every request still gets candidates
  const random = await User.aggregate([
    { $match: { role: 'nurse', status: 'approved', isActive: true } },
    { $sample: { size: limit + excluded.size + 4 } }
  ]);
  return random
    .filter((n) => !excluded.has(String(n._id)))
    .slice(0, limit)
    .map((n) => ({ nurse: n._id, distanceKm: null }));
}

module.exports = { pickMatchNurses, MATCH_LIMIT_DEFAULT };
