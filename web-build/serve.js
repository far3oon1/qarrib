const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api', limiter);

const frontendDir = __dirname;
app.use(express.static(frontendDir));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get(/^\/(?!api|health|uploads).*/, (req, res, next) => {
  const indexFile = path.join(frontendDir, 'index.html');
  if (req.method !== 'GET' || path.extname(req.path)) return next();
  res.sendFile(indexFile, (err) => { if (err) next(); });
});

app.get('/health', (req, res) => res.json({ success: true, message: 'Qarrib API is running', version: '1.0.0' }));

app.listen(PORT, '0.0.0.0', () => console.log(`Qarrib Web running on port ${PORT}`));
