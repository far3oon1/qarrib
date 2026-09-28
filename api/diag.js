// TEMP diagnostic v2: instance identity + connection state + raw error.
module.exports = async (req, res) => {
  const t = {};
  try {
    const apiMongoose = require('mongoose');
    t.apiMongoosePath = require.resolve('mongoose');
    const User = require('../backend/src/models/User');
    t.sameInstance = User.db === apiMongoose.connection;
    t.readyStateBefore = apiMongoose.connection.readyState;
    const t0 = Date.now();
    try {
      await apiMongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000
      });
      t.connectMs = Date.now() - t0;
      t.connected = true;
      t.readyStateAfter = apiMongoose.connection.readyState;
      t.pingCount = await User.countDocuments().catch((e) => 'ERR:' + String(e.message).slice(0, 120));
    } catch (e) {
      t.connectMs = Date.now() - t0;
      t.connectError = String((e && e.message) || e).slice(0, 300);
      t.readyStateAfter = apiMongoose.connection.readyState;
    }
    try { await apiMongoose.disconnect(); } catch (_) {}
  } catch (e) {
    t.fatal = String((e && e.message) || e).slice(0, 300);
  }
  return res.status(200).json(t);
};
