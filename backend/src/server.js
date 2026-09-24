const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const VERSION = require(path.resolve(__dirname, '..', 'package.json')).version;
const IS_DESKTOP = process.argv.some((a) => a === '--desktop') || process.env.DESKTOP_MODE === 'true';

if (IS_DESKTOP) {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
}

const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { initializeSocket } = require('./sockets');

// Route imports
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const orderRoutes = require('./routes/order.routes');
const notificationRoutes = require('./routes/notification.routes');
const patientRoutes = require('./routes/patient.routes');
const nurseRoutes = require('./routes/nurse.routes');
const paymentRoutes = require('./routes/payment.routes');
const walletRoutes = require('./routes/wallet.routes');
const chatRoutes = require('./routes/chat.routes');

const app = express();
app.set('trust proxy', 1); // required on Render/Railway/Heroku (https + rate-limit IPs)
const server = http.createServer(app);

// Realtime (chat + live GPS + order updates)
initializeSocket(server);

// Connect to database (retried inside config)
connectDB();

// Ensure local upload tmp dir exists (Cloudinary is used when configured)
const fs = require('fs');
try { fs.mkdirSync(path.join(__dirname, '..', 'uploads', 'temp'), { recursive: true }); } catch (_) {}

// Security middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
const allowedOrigins = (process.env.CLIENT_URL || '*').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));

// Rate limiting (generous: demo app with chat + live GPS polling)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check (both paths for compat: new + legacy frontend)
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Qarrab API is running',
    version: VERSION,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Qarrab API is running',
    version: VERSION,
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/nurses', nurseRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/chat', chatRoutes);

// Static frontend (same origin, avoids CORS in production)
const frontendDir = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendDir));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// 404 handler (API only — frontend SPA falls through to index)
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Frontend fallback (so /admin/dashboard etc. work on refresh in production)
app.get(/^\/(?!api|health|uploads).*/, (req, res, next) => {
  const indexFile = path.join(frontendDir, 'index.html');
  if (req.method !== 'GET' || path.extname(req.path)) return next();
  res.sendFile(indexFile, (err) => { if (err) next(); });
});

// Global error handler
app.use(errorHandler);

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
