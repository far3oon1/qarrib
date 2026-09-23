const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const orderFlow = require('../controllers/orderFlow.controller');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const multer = require('multer');
const { storage, fileFilter } = require('../config/multer');
const ApiError = require('../utils/ApiError');
const { createOrder, submitOffer } = require('../validators/order.validator');

router.use(protect);

router.post('/', (req, res, next) => {
  const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }).any();
  upload(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, 'حجم الملف كبير — الحد الأقصى 10MB'));
    if (err) return next(new ApiError(400, err.message));
    next();
  });
}, validate(createOrder), orderController.createOrder);

router.get('/my-orders', orderController.getMyOrders);
router.get('/my-orders/:orderId', orderController.getOrderDetails);
router.post('/my-orders/:orderId/pay', orderController.payForOrder);
router.get('/available', orderController.getAvailableOrders);
router.post('/:orderId/offer', validate(submitOffer), orderController.submitOffer);
router.get('/my-offers', orderController.getMyOffers);
router.get('/assigned', orderController.getAssignedOrders);
router.patch('/:orderId/status', orderController.updateNurseOrderStatus);

// --- Simple voice-note flow (frontend api.js compat) ---
router.post('/create', orderFlow.createSimple);
router.post('/:id/accept', orderFlow.acceptOrder);
router.post('/:id/start', orderFlow.startService);
router.post('/:id/confirm', orderFlow.confirmOrder);
router.post('/:id/cancel', orderFlow.cancelOrder);
router.post('/:id/rate', orderFlow.rateOrder);
router.post('/:id/approve-offer', orderFlow.approveOffer);
router.post('/:id/pay', orderFlow.payManual);
router.get('/:id', orderFlow.getOrderCompat);

module.exports = router;
