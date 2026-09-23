const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Absolute temp dir (works no matter where node is launched from)
const tempDir = path.join(__dirname, '..', '..', 'uploads', 'temp');
try { fs.mkdirSync(tempDir, { recursive: true }); } catch (_) {}
// Persistent fallback dir (used when Cloudinary is not configured)
const keepDir = path.join(__dirname, '..', '..', 'uploads', 'ids');
try { fs.mkdirSync(keepDir, { recursive: true }); } catch (_) {}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept ANY file type for ID / license uploads (photos, scans, PDFs,
  // HEIC from iPhones, Word docs, etc). Extension/mimetype is not validated —
  // admin reviews the document visually. Only empty files are rejected.
  cb(null, true);
};

const limits = { fileSize: 10 * 1024 * 1024 };

const uploadSingle = multer({ storage, fileFilter, limits }).single('image');
// Accepts every known alias so old + new frontends all work
const uploadMultiple = multer({ storage, fileFilter, limits }).fields([
  { name: 'idCardImage', maxCount: 1 },
  { name: 'licenseImage', maxCount: 1 },
  { name: 'idCard', maxCount: 1 },
  { name: 'license', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 2 },
  { name: 'document', maxCount: 2 },
  { name: 'idDocument', maxCount: 1 },
]);
// Catch-all: accepts ANY field name / ANY mimetype (used by new middleware)
const uploadAny = multer({ storage, fileFilter, limits }).any();

module.exports = { storage, fileFilter, uploadSingle, uploadMultiple, uploadAny, tempDir, keepDir };
