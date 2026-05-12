const express = require('express');

const Logger = require('../services/logger');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * Admin Routes for Security Logging
 * All routes require admin role
 */

/**
 * GET /api/admin/logs
 * Get all security logs with pagination and filtering
 */
router.get('/logs', protect, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { limit = 50, skip = 0, eventType, severity, userId } = req.query;
    const filters = {};

    if (eventType) filters.eventType = eventType;
    if (severity) filters.severity = severity;
    if (userId) filters.userId = userId;

    // Log admin access
    await Logger.logAdminAction(
      req.user._id,
      null,
      'adminViewedSecurityLogs',
      true,
      `Admin viewed security logs with filters: ${JSON.stringify(filters)}`,
    );

    const result = await Logger.queryLogs(filters, parseInt(limit), parseInt(skip));

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs/user/:userId
 * Get logs for a specific user
 */
router.get('/logs/user/:userId', protect, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    // Log admin access
    await Logger.logAdminAction(
      req.user._id,
      userId,
      'adminViewedUserLogs',
      true,
      `Admin viewed logs for user: ${userId}`,
    );

    const result = await Logger.getUserLogs(userId, parseInt(limit));

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs/critical
 * Get critical security events (last 24 hours or custom period)
 */
router.get('/logs/critical', protect, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { hours = 24 } = req.query;

    // Log admin access
    await Logger.logAdminAction(
      req.user._id,
      null,
      'adminViewedCriticalLogs',
      true,
      `Admin viewed critical logs (last ${hours} hours)`,
    );

    const result = await Logger.getCriticalEvents(parseInt(hours));

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs/anomalies
 * Detect and return security anomalies
 */
router.get('/logs/anomalies', protect, authorizeRoles('admin'), async (req, res, next) => {
  try {
    // Log admin access
    await Logger.logAdminAction(
      req.user._id,
      null,
      'adminDetectedAnomalies',
      true,
      'Admin ran anomaly detection',
    );

    const anomalies = await Logger.detectAnomalies();

    res.status(200).json(anomalies);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs/failed-logins/:userId
 * Get failed login attempts for a user
 */
router.get('/logs/failed-logins/:userId', protect, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { hours = 24 } = req.query;

    // Log admin access
    await Logger.logAdminAction(
      req.user._id,
      userId,
      'adminViewedFailedLogins',
      true,
      `Admin viewed failed login attempts for user: ${userId} (last ${hours} hours)`,
    );

    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
    const result = await Logger.queryLogs(
      {
        userId,
        eventType: 'loginFailed',
        createdAt: { $gte: since },
      },
      100,
      0,
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs/2fa-failures/:userId
 * Get 2FA failures for a user
 */
router.get('/logs/2fa-failures/:userId', protect, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { hours = 24 } = req.query;

    // Log admin access
    await Logger.logAdminAction(
      req.user._id,
      userId,
      'adminViewed2FAFailures',
      true,
      `Admin viewed 2FA failures for user: ${userId}`,
    );

    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
    const result = await Logger.queryLogs(
      {
        userId,
        eventType: { $regex: /twoFA/ },
        success: false,
        createdAt: { $gte: since },
      },
      100,
      0,
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs/encryption-failures
 * Get encryption/decryption failures
 */
router.get('/logs/encryption-failures', protect, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { hours = 24 } = req.query;

    // Log admin access
    await Logger.logAdminAction(
      req.user._id,
      null,
      'adminViewedEncryptionFailures',
      true,
      `Admin viewed encryption failures (last ${hours} hours)`,
    );

    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
    const result = await Logger.queryLogs(
      {
        $or: [
          { eventType: 'encryptionFailed' },
          { eventType: 'decryptionFailed' },
          { eventType: 'messageIntegrityCheckFailed' },
        ],
        createdAt: { $gte: since },
      },
      100,
      0,
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs/tampering
 * Get message tampering events
 */
router.get('/logs/tampering', protect, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { hours = 24 } = req.query;

    // Log admin access
    await Logger.logAdminAction(
      req.user._id,
      null,
      'adminViewedTamperingEvents',
      true,
      `Admin viewed tampering events (last ${hours} hours)`,
    );

    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
    const result = await Logger.queryLogs(
      {
        $or: [
          { eventType: 'messageContentTampered' },
          { eventType: 'possibleManInTheMiddleAttack' },
          { eventType: 'keyMismatchDetected' },
        ],
        createdAt: { $gte: since },
      },
      100,
      0,
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs/export
 * Export logs in JSON format (for analysis/compliance)
 */
router.get('/logs/export', protect, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { eventType, severity, startDate, endDate } = req.query;
    const filters = {};

    if (eventType) filters.eventType = eventType;
    if (severity) filters.severity = severity;

    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }

    // Log admin access
    await Logger.logAdminAction(
      req.user._id,
      null,
      'adminExportedLogs',
      true,
      `Admin exported logs with filters: ${JSON.stringify(filters)}`,
    );

    const result = await Logger.queryLogs(filters, 10000, 0); // Up to 10k for export

    res.set('Content-Type', 'application/json');
    res.set('Content-Disposition', `attachment; filename="security-logs-${Date.now()}.json"`);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs/stats
 * Get log statistics and summaries
 */
router.get('/logs/stats', protect, authorizeRoles('admin'), async (req, res, next) => {
  try {
    const { hours = 24 } = req.query;
    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

    // Log admin access
    await Logger.logAdminAction(
      req.user._id,
      null,
      'adminViewedLogStats',
      true,
      `Admin viewed log statistics (last ${hours} hours)`,
    );

    // Get various statistics
    const [
      totalLogs,
      criticalLogs,
      warnLogs,
      failedLogins,
      failedTwoFA,
      decryptionFailures,
      encryptionFailures,
      tamperingEvents,
    ] = await Promise.all([
      Logger.queryLogs({ createdAt: { $gte: since } }, 1, 0),
      Logger.queryLogs({ severity: 'CRITICAL', createdAt: { $gte: since } }, 1, 0),
      Logger.queryLogs({ severity: 'WARN', createdAt: { $gte: since } }, 1, 0),
      Logger.queryLogs({ eventType: 'loginFailed', createdAt: { $gte: since } }, 1, 0),
      Logger.queryLogs({ eventType: { $regex: /twoFA/ }, success: false, createdAt: { $gte: since } }, 1, 0),
      Logger.queryLogs({ eventType: 'decryptionFailed', createdAt: { $gte: since } }, 1, 0),
      Logger.queryLogs({ eventType: 'encryptionFailed', createdAt: { $gte: since } }, 1, 0),
      Logger.queryLogs({ eventType: 'messageContentTampered', createdAt: { $gte: since } }, 1, 0),
    ]);

    const stats = {
      period: `Last ${hours} hours`,
      totalLogs: totalLogs.total,
      criticalLogs: criticalLogs.total,
      warnLogs: warnLogs.total,
      byEventType: {
        failedLogins: failedLogins.total,
        failedTwoFA: failedTwoFA.total,
        decryptionFailures: decryptionFailures.total,
        encryptionFailures: encryptionFailures.total,
        tamperingEvents: tamperingEvents.total,
      },
    };

    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
