// Nearest-nurse matcher: approved nurses ordered by live-location distance
// to a point. Online nurses come first; approved offline nurses fill the
// list so requests still move when nobody is flagged online.
const User = require('../models/User');
const { distanceKm } = require('./distance');

async function findNearestNurses({ lat, lng, limit = 10 } = {}) {
  const point = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return [];
  const base = {
    role: 'nurse',
    status: 'approved',
    isActive: true,
    'location.coordinates.lat': { $ne: null },
    'location.coordinates.lng': { $ne: null }
  };
  const select = '_id fullName phone location isOnline specialization';
  const rank = (list) => list
    .map((n) => {
      const c = n.location && n.location.coordinates ? n.location.coordinates : null;
      return {
        nurse: n,
        distanceKm: c ? distanceKm(point, { lat: Number(c.lat), lng: Number(c.lng) }) : Infinity
      };
    })
    .filter((x) => Number.isFinite(x.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const online = rank(await User.find({ ...base, isOnline: true }).select(select).limit(100));
  if (online.length >= limit) return online.slice(0, limit);
  const seen = new Set(online.map((x) => String(x.nurse._id)));
  const offline = rank(await User.find({ ...base, isOnline: { $ne: true } }).select(select).limit(100));
  return online.concat(offline.filter((x) => !seen.has(String(x.nurse._id)))).slice(0, limit);
}

module.exports = { findNearestNurses };
