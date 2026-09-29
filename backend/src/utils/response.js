const { toEnglish } = require('./i18n');

class ResponseHelper {
  static success(res, data, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      message_en: toEnglish(message),
      data,
      timestamp: new Date().toISOString()
    });
  }

  static error(res, message, statusCode = 400, errors = []) {
    return res.status(statusCode).json({
      success: false,
      message,
      message_en: toEnglish(message),
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    });
  }

  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      success: true,
      message,
      message_en: toEnglish(message),
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit),
        hasNextPage: pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrevPage: pagination.page > 1
      },
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = ResponseHelper;
