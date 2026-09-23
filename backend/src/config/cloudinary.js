const cloudinary = require('cloudinary').v2;

const isConfigured = () => {
  return process.env.CLOUDINARY_CLOUD_NAME && 
         process.env.CLOUDINARY_API_KEY && 
         process.env.CLOUDINARY_API_SECRET;
};

if (isConfigured()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

const uploadToCloudinary = async (filePath, folder = 'qarrab') => {
  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env');
  }
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'auto'
    });
    return { url: result.secure_url, publicId: result.public_id };
  } catch (error) {
    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
};

const deleteFromCloudinary = async (publicId) => {
  if (!isConfigured()) return true;
  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (error) {
    console.error('Cloudinary delete failed:', error.message);
    return false;
  }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary, isConfigured };
