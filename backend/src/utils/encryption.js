// Field-level encryption for sensitive account data (admin-only decryption).
// AES-256-GCM. Key from ENCRYPTION_KEY (64 hex chars) or derived from JWT_SECRET.
// Format: ivHex:authTagHex:cipherHex. Only the admin credentials endpoint decrypts.
const crypto = require('crypto');

function getKey() {
  const raw = (process.env.ENCRYPTION_KEY || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  if (raw) return crypto.createHash('sha256').update(raw).digest();
  const fallback = process.env.JWT_SECRET || 'qarrib-dev-only-key';
  return crypto.createHash('sha256').update(String(fallback)).digest();
}

function encryptText(plain) {
  if (plain === null || plain === undefined) return null;
  const s = String(plain);
  if (!s) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

function decryptText(blob) {
  if (!blob || typeof blob !== 'string') return null;
  const parts = blob.split(':');
  if (parts.length !== 3) return null;
  try {
    const key = getKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(parts[2], 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch (_) {
    return null;
  }
}

function encryptObject(obj) {
  try {
    return encryptText(JSON.stringify(obj || {}));
  } catch (_) {
    return null;
  }
}

function decryptObject(blob) {
  const s = decryptText(blob);
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

// Masking helpers — everything non-admin receives masked values only.
function maskEmail(email) {
  if (!email || typeof email !== 'string' || email.indexOf('@') === -1) return '***';
  const [name, domain] = email.split('@');
  const head = (name || '').slice(0, 1) || '*';
  return `${head}***@${domain}`;
}

function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length < 4) return '*******';
  return `${s.slice(0, 2)}****${s.slice(-3)}`;
}

function maskNationalId(nid) {
  if (!nid) return '**************';
  const s = String(nid);
  if (s.length < 4) return '**************';
  return `${'*'.repeat(Math.max(0, s.length - 3))}${s.slice(-3)}`;
}

function maskAccount(acc) {
  const s = String(acc || '');
  if (!s) return '***';
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

function isEncryptedBlob(v) {
  return typeof v === 'string' && /^[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]+$/.test(v);
}

module.exports = {
  encryptText,
  decryptText,
  encryptObject,
  decryptObject,
  maskEmail,
  maskPhone,
  maskNationalId,
  maskAccount,
  isEncryptedBlob,
};
