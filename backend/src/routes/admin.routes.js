const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { verifyNurse, resetPassword, updateOrderStatus } = require('../validators/admin.validator');

router.use(protect, authorize('admin'));

router.get('/dashboard', adminController.getDashboardStats);
router.get('/verifications', adminController.getVerificationsCompat);
router.get('/verifications/pending', adminController.getPendingVerifications);
router.get('/verifications/:nurseId', adminController.getNurseVerificationDetails);
router.post('/verifications/:nurseId', validate(verifyNurse), adminController.verifyNurse);
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.put('/users/:userId', adminController.updateUser);
router.delete('/users/:userId', adminController.deleteUser);
router.post('/users/:userId/reset-password', validate(resetPassword), adminController.resetUserPassword);
router.patch('/users/:userId/toggle-status', adminController.toggleUserStatus);
router.get('/orders', adminController.getAllOrders);
router.post('/orders/:orderId/complete', adminController.completeOrder);
router.get('/payments', adminController.getPaymentsStats);
router.get('/topups', adminController.getPendingTopups);
router.post('/topups/:topupId', adminController.reviewTopup);
router.get('/withdrawals', adminController.getPendingWithdrawals);
router.post('/withdrawals/:withdrawalId', adminController.reviewWithdrawal);
router.get('/earnings', adminController.getAdminEarnings);
router.post('/reset-payments', adminController.resetAllPayments);
router.post('/orders/:orderId/approve-offer', adminController.approveNurseOffer);
router.get('/orders/:orderId', adminController.getOrderDetails);
router.post('/orders/:orderId/review-price', adminController.reviewOrderPrice);
router.patch('/orders/:orderId/status', validate(updateOrderStatus), adminController.updateOrderStatus);

module.exports = router;
