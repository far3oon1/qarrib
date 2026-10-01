// Cached MongoDB connection for serverless functions.
// Lives INSIDE backend/ so it always uses the exact same mongoose module
// instance as the models (Node resolves requires within one module graph),
// no matter how dependencies are installed or bundled.
const mongoose = require('mongoose');

const cached = global.__qarribMongoose || (global.__qarribMongoose = { conn: null, promise: null });

async function ensureDB() {
  if (cached.conn) {
    if (cached.conn.connection.readyState === 1) return cached.conn;
    if (cached.conn.connection.readyState === 2) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          mongoose.connection.off('connected', onConnected);
          reject(new Error('MongoDB reconnect timed out'));
        }, 12000);
        function onConnected() {
          clearTimeout(timeout);
          resolve(mongoose);
        }
        mongoose.connection.once('connected', onConnected);
      });
    }
    cached.conn = null;
    cached.promise = null;
  }
  if (!cached.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not defined');
    cached.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 12000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 20000
      })
      .then((m) => m)
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = { ensureDB, mongoose };
