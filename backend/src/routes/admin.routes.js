const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const deviceController = require('../controllers/device.controller');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { verifyNurse, resetPassword, updateOrderStatus } = require('../validators/admin.validator');
const { handleUploadSingle, handleUploadMultiple } = require('../middleware/upload');

router.use(protect, authorize('admin'));

router.get('/dashboard', adminController.getDashboardStats);
router.get('/verifications', adminController.getVerificationsCompat);
router.get('/verifications/pending', adminController.getPendingVerifications);
router.get('/verifications/:nurseId', adminController.getNurseVerificationDetails);
router.post('/verifications/:nurseId', validate(verifyNurse), adminController.verifyNurse);
router.get('/users', adminController.getAllUsers);
router.post('/users', adminController.createUser);
router.get('/users/:userId', adminController.getUserById);
router.put('/users/:userId', adminController.updateUser);
// Admin-only vault: full credentials + registration info (decrypted, online)
router.get('/users/:userId/credentials', adminController.getUserCredentials);
// Admin-only online edit of ANY account field (registration + credentials)
router.put('/users/:userId/full', adminController.updateUserFull);
router.delete('/users/:userId', adminController.deleteUser);
// Helper / assistant accounts with admin-ticked policies
router.get('/assistants', adminController.listAssistants);
router.post('/assistants', adminController.createAssistant);
router.put('/assistants/:id', adminController.updateAssistant);
router.delete('/assistants/:id', adminController.deleteAssistant);
router.post('/users/:userId/reset-password', validate(resetPassword), adminController.resetUserPassword);
router.patch('/users/:userId/toggle-status', adminController.toggleUserStatus);
router.get('/nurses', adminController.getAllNurses);
router.get('/patients', adminController.getAllPatients);
router.post('/set-price', adminController.setPrice);
router.get('/prices', adminController.getPrices);
router.delete('/price/:serviceId', adminController.deletePrice);
router.get('/transactions', adminController.getTransactions);
router.post('/send-credentials/:userId', adminController.sendCredentials);
router.put('/nurse-status/:nurseId', adminController.updateNurseStatus);
router.get('/orders', adminController.getAllOrders);
router.post('/orders/:orderId/complete', adminController.completeOrder);
router.post('/orders/:orderId/set-price', adminController.setOrderPrice);
router.post('/orders/:orderId/suggest-price', adminController.suggestOrderPrice);
router.post('/orders/:orderId/approve-service', adminController.approveService);
router.post('/orders/:orderId/approve-offer', adminController.approveNurseOffer);
router.post('/orders/:orderId/reject-offer', adminController.rejectNurseOffer);
router.get('/offers', adminController.getAllOffers);
router.get('/feedbacks', adminController.getFeedbacks);
router.get('/nurse-reports', adminController.getNurseReports);
router.patch('/services/:serviceId', adminController.updateService);
router.get('/payments', adminController.getPaymentsStats);
router.get('/topups', adminController.getPendingTopups);
router.post('/topups/:topupId', adminController.reviewTopup);
router.get('/withdrawals', adminController.getPendingWithdrawals);
router.post('/withdrawals/:withdrawalId', adminController.reviewWithdrawal);
router.get('/earnings', adminController.getAdminEarnings);
router.post('/reset-payments', adminController.resetAllPayments);
// Permissions GUI (mirrors /api/permissions/admin/*)
router.get('/permissions/settings', adminController.getPermissionSettingsCompat || require('../controllers/permissions.controller').adminGetSettings);
router.put('/permissions/settings', require('../controllers/permissions.controller').adminUpdateSettings);
router.get('/permissions/users', require('../controllers/permissions.controller').adminListUserPermissions);
router.put('/permissions/users/:id', require('../controllers/permissions.controller').adminUpdateUserPermissions);
router.get('/orders/:orderId', adminController.getOrderDetails);
router.delete('/orders/:orderId', adminController.deleteOrder);
router.patch('/orders/:orderId/status', validate(updateOrderStatus), adminController.updateOrderStatus);
// ---- Admin accounts (admin panel only: add / remove / enable-disable) ----
router.get('/admins', deviceController.listAdmins);
router.post('/admins', deviceController.createAdmin);
router.delete('/admins/:id', deviceController.deleteAdmin);
router.patch('/admins/:id/status', deviceController.toggleAdminStatus);
// ---- Devices (admin panel only: track at register/login, block/unblock) ----
router.get('/devices', deviceController.listDevices);
router.post('/devices/block', deviceController.blockDevice);
router.post('/devices/unblock', deviceController.unblockDevice);
router.delete('/devices/:id', deviceController.deleteDevice);
router.get('/users/:userId/devices', deviceController.getUserDevices);
// ---- Audit log (fraud-prevention trail, admin panel only) ----
router.get('/audit-log', deviceController.listAuditLog);

module.exports = router;
