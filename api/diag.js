// Diagnostic: times each startup stage (require app, connect DB) and
// returns the breakdown as JSON. Temporary debugging endpoint.
module.exports = async (req, res) => {
  const t = {};
  let t0 = Date.now();
  try {
    require('../backend/src/app');
    t.requireAppMs = Date.now() - t0;
  } catch (e) {
    t.requireAppError = String((e && e.message) || e).slice(0, 300);
    return res.status(500).json(t);
  }
  t0 = Date.now();
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000
    });
    t.connectMs = Date.now() - t0;
    t.connected = true;
    try { await mongoose.disconnect(); } catch (_) {}
  } catch (e) {
    t.connectMs = Date.now() - t0;
    t.connectError = String((e && e.message) || e).slice(0, 300);
  }
  return res.status(200).json(t);
};
