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

// The connection is opened through backend/src/config/serverless.js so it
// always uses the exact same mongoose module instance as the models,
// regardless of how node_modules is laid out in the bundle.
const { ensureDB } = require('../backend/src/config/serverless');

const app = require('../backend/src/app');

module.exports = async (req, res) => {
  const url = String((req && req.url) || '');
  // Health probes check process liveness; database readiness is checked on API requests.
  if (url.indexOf('/health') === -1) {
    let dbTimeoutId;
    const dbTimeout = new Promise((_, reject) => {
      dbTimeoutId = setTimeout(() => reject(new Error('DB connect timeout')), 15000);
    });
    try {
      await Promise.race([ensureDB(), dbTimeout]);
    } catch (err) {
      console.error(`MongoDB unavailable (${err.name}): ${err.message}`);
      return res.status(503).json({ success: false, message: 'Database unavailable, please try again shortly.', message_en: 'Database unavailable, please try again shortly.' });
    } finally {
      clearTimeout(dbTimeoutId);
    }
  }
  // NOTE: the Express app is exported directly (no serverless-http wrapper).
  return app(req, res);
};
