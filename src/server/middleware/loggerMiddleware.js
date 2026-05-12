const Logger = require('../services/logger');

/**
 * HTTP Request Logging Middleware
 * Captures request context for all routes
 */
function requestLogger(req, res, next) {
  // Attach logging context to request
  req.logContext = {
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'] || 'unknown',
    userId: req.user ? req.user._id : null,
    method: req.method,
    path: req.path,
    startTime: Date.now(),
  };

  // Wrap response.json to capture response status for logging
  const originalJson = res.json;
  res.json = function loggedJson(data) {
    req.logContext.statusCode = res.statusCode;
    req.logContext.endTime = Date.now();
    req.logContext.duration = req.logContext.endTime - req.logContext.startTime;
    return originalJson.call(this, data);
  };

  // Wrap res.status to capture status codes
  const originalStatus = res.status;
  res.status = function statusWithCapture(statusCode) {
    req.logContext.statusCode = statusCode;
    return originalStatus.call(this, statusCode);
  };

  next();
}

module.exports = {
  requestLogger,
};
