const { uploadSingle, uploadMultiple, uploadAny } = require('../config/multer');
const ApiError = require('../utils/ApiError');

// Normalize .any() output so old controller code keeps working:
// - req.file = first file (for patient single upload)
// - req.files = grouped object when it was an object, or array stays array
const normalizeAnyFiles = (req) => {
  if (Array.isArray(req.files) && req.files.length) {
    const grouped = {};
    req.files.forEach((f) => {
      if (!grouped[f.fieldname]) grouped[f.fieldname] = [];
      grouped[f.fieldname].push(f);
    });
    // keep raw array too for "any order" fallback
    grouped.__all = req.files;
    if (!req.file) req.file = req.files[0];
    req.files = grouped;
  }
};

const friendlyError = (err) => {
  if (!err) return null;
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new ApiError(400, 'حجم الملف كبير — الحد الأقصى 10MB');
  }
  return new ApiError(400, err.message);
};

const handleUploadSingle = () => {
  return (req, res, next) => {
    uploadAny(req, res, (err) => {
      const friendly = friendlyError(err);
      if (friendly) return next(friendly);
      try { normalizeAnyFiles(req); } catch (_) {}
      // backward compat: .single('image') populated req.file; .any() does too now
      next();
    });
  };
};

const handleUploadMultiple = () => {
  return (req, res, next) => {
    uploadAny(req, res, (err) => {
      const friendly = friendlyError(err);
      if (friendly) return next(friendly);
      try { normalizeAnyFiles(req); } catch (_) {}
      next();
    });
  };
};

module.exports = { handleUploadSingle, handleUploadMultiple };
