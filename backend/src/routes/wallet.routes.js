const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', walletController.getWallet);
router.get('/transaction/:id', walletController.getTransaction);
router.post('/withdraw', walletController.requestWithdrawal);
router.post('/topup', walletController.topupRequest);
router.post('/transfer', walletController.transferBalance);
router.get('/nurse/transfers', walletController.nurseTransfers);

module.exports = router;
