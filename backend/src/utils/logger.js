const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '..', '..', 'logs');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: buildTransports()
});

function buildTransports() {
  const transports = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ];
  // File logs only on persistent servers — serverless functions (Vercel)
  // run on a read-only filesystem, so a File transport would crash requests.
  if (process.env.VERCEL !== '1') {
    try {
      require('fs').mkdirSync(logDir, { recursive: true });
      transports.unshift(
        new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
      );
    } catch (_) { /* stay console-only */ }
  }
  return transports;
}

module.exports = logger;