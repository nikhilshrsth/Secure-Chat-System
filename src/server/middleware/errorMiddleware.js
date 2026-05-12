const Logger = require('../services/logger');

function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  res.status(404);
  next(error);
}

function errorHandler(error, req, res, next) {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  const logContext = req.logContext || {};

  // Log the error asynchronously
  (async () => {
    try {
      await Logger.log({
        eventType: 'httpError',
        userId: logContext.userId,
        ipAddress: logContext.ipAddress,
        userAgent: logContext.userAgent,
        success: false,
        details: `${logContext.method} ${logContext.path}: ${error.message}`,
        severity: statusCode >= 500 ? 'CRITICAL' : 'WARN',
        failureReason: error.name,
      });
    } catch (logError) {
      console.error('Error logging failed:', logError);
    }
  })();

  res.status(statusCode).json({
    message: error.message || 'Server error',
  });
}

module.exports = {
  notFound,
  errorHandler,
};
