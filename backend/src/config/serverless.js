// Cached MongoDB connection for serverless functions.
// Lives INSIDE backend/ so it always uses the exact same mongoose module
// instance as the models (Node resolves requires within one module graph),
// no matter how dependencies are installed or bundled.
const mongoose = require('mongoose');

const cached = global.__qarribMongoose || (global.__qarribMongoose = { conn: null, promise: null });

async function ensureDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not defined');
    cached.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
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
