const fs = require('fs');
const path = require('path');
const { uploadToCloudinary, isConfigured } = require('../config/cloudinary');
const { keepDir } = require('../config/multer');

// Save an uploaded ID/license file:
// - Cloudinary when configured (returns remote url)
// - otherwise keep it locally under /uploads/ids (returns local url the admin can open)
// Never throws — returns { url, publicId } with url possibly null.
// Accepts ANY file type / extension.
async function saveIdFile(file, folder = 'qarrab/id-cards') {
  if (!file) return { url: null, publicId: null };
  if (isConfigured()) {
    try {
      const result = await uploadToCloudinary(file.path, folder);
      try { fs.unlinkSync(file.path); } catch (_) {}
      return { url: result.url, publicId: result.publicId };
    } catch (err) {
      console.log('Cloudinary upload failed, keeping file locally:', err.message);
    }
  }
  try {
    let ext = path.extname(file.originalname || '') || path.extname(file.filename || '') || '';
    // Files without extension (e.g. pasted from some phones) default to .jpg so admin can still open them
    if (!ext) ext = '.jpg';
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const dest = path.join(keepDir, name);
    fs.renameSync(file.path, dest);
    return { url: `/uploads/ids/${name}`, publicId: null };
  } catch (err) {
    console.log('Local file keep failed:', err.message);
    try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (_) {}
    return { url: null, publicId: null };
  }
}

module.exports = { saveIdFile };
