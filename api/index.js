// Vercel serverless entry point — serves the whole Express API from /api/*
// (see vercel.json rewrites). Realtime (socket.io) is unavailable on
// serverless functions, so it is skipped here; the frontend falls back to
// REST polling (chat, live GPS, notifications) when websockets are absent.
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const backendEnvPath = path.join(__dirname, '..', 'backend', '.env');
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}

const mongoose = require('mongoose');

const cached = global.__qarribMongoose || (global.__qarribMongoose = { conn: null, promise: null });

async function connectDB() {
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

const serverless = require('serverless-http');
const app = require('../backend/src/app');

const handler = serverless(app);

module.exports = async (req, res) => {
  const url = String((req && req.url) || '');
  // Never let the database hold the request longer than a few seconds —
  // serverless functions must answer fast even when MongoDB is unreachable.
  const dbTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('DB connect timeout')), 8000)
  );
  try {
    await Promise.race([connectDB(), dbTimeout]);
  } catch (err) {
    // Stay up without a database for health checks (mirrors server.js,
    // which keeps listening when MongoDB is unreachable).
    if (url.indexOf('/health') === -1) throw err;
  }
  return handler(req, res);
};
