const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { handleUploadSingle, handleUploadMultiple } = require('../middleware/upload');
const { registerPatient, registerNurse, login, loginPhone, adminLogin, adminRegister, adminResetPassword } = require('../validators/auth.validator');

// Frontend sends `name` (register.html) while validators expect `fullName`,
// plus flat address without governorate/city — normalize before validation
// so uploads never fail with a confusing error.
const normalizeRegister = (req, res, next) => {
  if (req.body) {
    if (!req.body.fullName && req.body.name) req.body.fullName = req.body.name;
    if (!req.body.governorate) req.body.governorate = 'Cairo';
    if (!req.body.city) req.body.city = 'Cairo';
    if (req.body.yearsOfExperience === '' || req.body.yearsOfExperience === undefined) {
      req.body.yearsOfExperience = 0;
    }
  }
  next();
};

router.post('/register/patient', handleUploadSingle(), normalizeRegister, validate(registerPatient), authController.registerPatient);
router.post('/register/nurse', handleUploadMultiple(), normalizeRegister, validate(registerNurse), authController.registerNurse);
router.post('/login', validate(login), authController.login);
router.post('/login/phone', validate(loginPhone), authController.loginWithPhone);
router.post('/logout', protect, authController.logout);
// Dedicated admin endpoints
router.post('/admin/login', validate(adminLogin), authController.adminLogin);
router.post('/admin/register', validate(adminRegister), authController.adminRegister);
router.post('/admin/reset-password', protect, authorize('admin'), validate(adminResetPassword), authController.adminResetPassword);
router.post('/upload-documents', protect, handleUploadMultiple(), authController.uploadDocuments);
router.get('/me', protect, authController.getMe);
router.put('/me', protect, authController.updateProfile);

module.exports = router;
