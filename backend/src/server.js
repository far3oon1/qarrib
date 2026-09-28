const http = require('http');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const IS_DESKTOP = process.argv.some((a) => a === '--desktop') || process.env.DESKTOP_MODE === 'true';
const desktopRuntimePort = IS_DESKTOP ? process.env.PORT : undefined;

const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const backendEnvPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
}

if (IS_DESKTOP && fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: true });
  if (desktopRuntimePort) process.env.PORT = desktopRuntimePort;
}

// Ensure required directories exist before logger
try { fs.mkdirSync(path.join(__dirname, '..', '..', 'logs'), { recursive: true }); } catch (_) {}
try { fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'temp'), { recursive: true }); } catch (_) {}

const connectDB = require('./config/database');
const logger = require('./utils/logger');
const { initializeSocket } = require('./sockets');
const app = require('./app');

const server = http.createServer(app);

// Realtime (chat + live GPS + order updates) — persistent servers only.
// The Vercel serverless handler (api/index.js) uses app.js directly and
// skips this; realtime features fall back to REST polling there.
initializeSocket(server);

// Connect to database (retried inside config)
connectDB();

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Qarrab API running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Port already in use (e.g. server started twice) — explain instead of crashing
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use — another Qarrib server is running. Close the other window or use a different PORT.`);
  } else {
    logger.error('Server error:', { message: err && err.message, stack: err && err.stack });
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', { message: err && err.message, stack: err && err.stack });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', { message: err && err.message, stack: err && err.stack });
});

module.exports = { app, server };
