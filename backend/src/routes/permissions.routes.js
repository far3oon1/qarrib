const express = require('express');
const router = express.Router();
const permissionsController = require('../controllers/permissions.controller');
const { protect, authorize } = require('../middleware/auth');

// Any logged-in user: read what is required + save device/legal consents
router.get('/required', protect, permissionsController.getRequired);
router.post('/consent', protect, permissionsController.saveConsent);

// Admin GUI: required-per-role matrix + per-user overrides
router.get('/admin/settings', protect, authorize('admin'), permissionsController.adminGetSettings);
router.put('/admin/settings', protect, authorize('admin'), permissionsController.adminUpdateSettings);
router.get('/admin/users', protect, authorize('admin'), permissionsController.adminListUserPermissions);
router.put('/admin/users/:id', protect, authorize('admin'), permissionsController.adminUpdateUserPermissions);

module.exports = router;
