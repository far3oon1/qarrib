const express = require('express');
const router = express.Router();
const callSignalController = require('../controllers/callSignal.controller');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/signals', callSignalController.receiveSignals);
router.post('/signals', callSignalController.sendSignal);

module.exports = router;