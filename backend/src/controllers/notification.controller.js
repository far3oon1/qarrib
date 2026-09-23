const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const ResponseHelper = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const getMyNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly = false } = req.query;
  const query = { recipient: req.user.id };
  if (unreadOnly === 'true') query.isRead = false;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Notification.countDocuments(query),
    Notification.countDocuments({ recipient: req.user.id, isRead: false })
  ]);

  ResponseHelper.success(res, { notifications, unreadCount, pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) || 1 } }, 'الإشعارات');
});

const markAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: req.user.id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  if (!notification) throw new ApiError(404, 'الإشعار غير موجود');
  ResponseHelper.success(res, { notification }, 'تم تحديث الإشعار');
});

const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipient: req.user.id, isRead: false }, { isRead: true, readAt: new Date() });
  ResponseHelper.success(res, {}, 'تم تحديد جميع الإشعارات كمقروءة');
});

module.exports = { getMyNotifications, markAsRead, markAllAsRead };
