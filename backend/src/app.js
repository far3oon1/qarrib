const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const VERSION = require(path.resolve(__dirname, '..', 'package.json')).version;

const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

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
const serviceRoutes = require('./routes/service.routes');
const permissionRoutes = require('./routes/permissions.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const assistantRoutes = require('./routes/assistant.routes');
const callSignalRoutes = require('./routes/callSignal.routes');

const app = express();
app.set('trust proxy', 1); // required on Render/Railway/Heroku/Vercel (https + rate-limit IPs)

// Security middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
const configuredOrigins = (process.env.CLIENT_URL || '*').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
const allowedOrigins = new Set(configuredOrigins);
const isLocalOrigin = (origin) => typeof origin === 'string' && /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin.replace(/\/$/, ''));
const isPublicHostedOrigin = (origin) => typeof origin === 'string' && /^(https?:\/\/)?([\w-]+\.)*(onrender\.com|github\.io|vercel\.app)(:\d+)?$/.test(origin.replace(/\/$/, ''));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has('*') || allowedOrigins.has(origin) || isLocalOrigin(origin) || isPublicHostedOrigin(origin)) {
      return cb(null, true);
    }
    return cb(null, false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language', 'X-Lang', 'X-Device-Id', 'X-Device-Platform'],
  exposedHeaders: ['X-Device-Id']
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
app.use('/api/services', serviceRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/calls', callSignalRoutes);

// Static frontend (same origin, avoids CORS in production — Render/desktop only.
// On Vercel the frontend is served as static output, so these simply never match.)
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

module.exports = app;
