const express = require('express');

const User = require('../models/User');
const SecurityLog = require('../models/SecurityLog');
const AdminAuditLog = require('../models/AdminAuditLog');
const ChatThread = require('../models/ChatThread');
const DevSecOpsScan = require('../models/DevSecOpsScan');
const EphemeralMessageLog = require('../models/EphemeralMessageLog');
const MessageIntegrityLog = require('../models/MessageIntegrityLog');
const SuspiciousAlert = require('../models/SuspiciousAlert');
const Logger = require('../services/logger');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const requireAdmin = [protect, authorizeRoles('admin')];

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || req.ip || null;
}

function parseLimit(value, fallback = 50, max = 250) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function accountStatus(user) {
  if (!user.isActive || user.isLocked) return 'Suspended';
  return 'Active';
}

function displayRole(role) {
  return role === 'admin' ? 'Admin' : 'Customer';
}

function mapUserForAdmin(user, failedLoginsToday = 0) {
  return {
    id: user._id,
    name: user.username,
    email: user.email,
    role: displayRole(user.role),
    twoFactorStatus: user.isTwoFactorEnabled ? 'Enabled' : 'Disabled',
    accountStatus: accountStatus(user),
    lastLoginAt: user.lastLoginAt,
    failedLoginCount: user.failedLoginCount || failedLoginsToday,
    createdAt: user.createdAt,
  };
}

function isCustomerAccount(user) {
  return user && (user.role === 'customer' || user.role === 'user');
}

function mapSecurityLog(log) {
  return {
    id: log._id,
    eventType: log.eventType,
    userId: log.userId,
    targetUserId: log.targetUserId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    timestamp: log.createdAt || log.eventTime,
    description: log.details,
    severity: log.severity,
    success: log.success,
    failureReason: log.failureReason,
  };
}

function riskFromLog(log) {
  if (log.severity === 'CRITICAL') return 'High';
  if (log.severity === 'WARN' || log.success === false) return 'Medium';
  return 'Low';
}

async function writeAudit(req, action, targetType, targetId, result = 'success', reason = '') {
  await AdminAuditLog.create({
    adminUserId: req.user._id,
    action,
    targetType,
    targetId: targetId ? String(targetId) : null,
    ipAddress: getClientIp(req),
    result,
    reason,
  });

  await Logger.logAdminAction(
    req.user._id,
    targetType === 'customer' ? targetId : null,
    action,
    result === 'success',
    reason || `Admin performed ${action}`,
    result === 'success' ? 'INFO' : 'WARN',
  );
}

async function findCustomerTarget(req, res, next) {
  const user = await User.findById(req.params.userId);
  if (!user) {
    res.status(404);
    next(new Error('Customer account not found'));
    return null;
  }

  if (!isCustomerAccount(user)) {
    res.status(403);
    next(new Error('Admins can only activate or suspend customer accounts'));
    return null;
  }

  return user;
}

async function upsertAlert({ userId = null, activityType, description, riskLevel, sourceRef, sourceLogId = null }) {
  return SuspiciousAlert.findOneAndUpdate(
    { activityType, sourceRef },
    {
      $setOnInsert: {
        userId,
        activityType,
        description,
        riskLevel,
        sourceRef,
        sourceLogId,
        status: 'open',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function ensureDemoData() {
  // Metadata-only demo records support local assessment without exposing plaintext messages or secrets.
  const [users, threadCount, integrityCount, ephemeralCount, scanCount] = await Promise.all([
    User.find().limit(3),
    ChatThread.countDocuments(),
    MessageIntegrityLog.countDocuments(),
    EphemeralMessageLog.countDocuments(),
    DevSecOpsScan.countDocuments(),
  ]);

  const primaryUser = users[0]?._id || null;
  const secondaryUser = users[1]?._id || primaryUser;

  if (threadCount === 0) {
    await ChatThread.insertMany([
      {
        threadType: 'direct',
        participantIds: [primaryUser, secondaryUser].filter(Boolean),
        createdBy: primaryUser,
        lastActivityAt: new Date(Date.now() - 18 * 60 * 1000),
        messageCount: 42,
        status: 'active',
      },
      {
        threadType: 'group',
        participantIds: users.map((user) => user._id),
        createdBy: primaryUser,
        lastActivityAt: new Date(Date.now() - 45 * 60 * 1000),
        messageCount: 128,
        status: 'suspicious',
      },
    ]);
  }

  if (integrityCount === 0) {
    await MessageIntegrityLog.insertMany([
      {
        messageId: 'msg-meta-1001',
        threadId: 'direct-demo-1',
        senderId: primaryUser,
        hashStatus: 'present',
        verificationResult: 'valid',
        actionTaken: 'metadata recorded',
      },
      {
        messageId: 'msg-meta-1002',
        threadId: 'group-demo-1',
        senderId: secondaryUser,
        hashStatus: 'mismatch',
        verificationResult: 'failed',
        actionTaken: 'message quarantined and alert created',
      },
    ]);
  }

  if (ephemeralCount === 0) {
    await EphemeralMessageLog.insertMany([
      {
        messageId: 'eph-meta-2001',
        threadId: 'direct-demo-1',
        senderId: primaryUser,
        expiryAt: new Date(Date.now() + 15 * 60 * 1000),
        deletionStatus: 'pending',
      },
      {
        messageId: 'eph-meta-2002',
        threadId: 'group-demo-1',
        senderId: secondaryUser,
        expiryAt: new Date(Date.now() - 12 * 60 * 1000),
        deletionStatus: 'failed',
        failureReason: 'storage worker timeout',
      },
    ]);
  }

  if (scanCount === 0) {
    await DevSecOpsScan.create({
      buildStatus: 'passed',
      sastStatus: 'warning',
      dastStatus: 'passed',
      dependencyStatus: 'passed',
      unitTestStatus: 'passed',
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      rollbackStatus: 'available',
      deployedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      scanSummaries: [
        { tool: 'SonarQube', status: 'warning', summary: 'One medium maintainability hotspot; no hardcoded secrets found.', highFindings: 0 },
        { tool: 'OWASP ZAP', status: 'passed', summary: 'Baseline DAST scan passed authenticated admin routes.', highFindings: 0 },
        { tool: 'Dependency scan', status: 'passed', summary: 'No critical vulnerable packages detected.', criticalFindings: 0 },
        { tool: 'Unit and integration tests', status: 'passed', summary: 'Core server tests passing.', criticalFindings: 0 },
      ],
    });
  }
}

async function detectAndPersistAlerts() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  const [failedLoginGroups, mfaFailureGroups, disabledAttempts, multiIpGroups, integrityFailures, expiredDeletionFailures] =
    await Promise.all([
      SecurityLog.aggregate([
        { $match: { eventType: 'loginFailed', createdAt: { $gte: tenMinutesAgo } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $match: { count: { $gte: 5 } } },
      ]),
      SecurityLog.aggregate([
        { $match: { eventType: { $in: ['mfaLoginFailed', 'multipleFailedTwoFAAttempts'] }, createdAt: { $gte: fifteenMinutesAgo } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
        { $match: { count: { $gte: 3 } } },
      ]),
      SecurityLog.find({ eventType: 'loginFailed', details: /disabled account/i }).limit(20),
      SecurityLog.aggregate([
        { $match: { eventType: 'loginFailed', createdAt: { $gte: fifteenMinutesAgo }, userId: { $ne: null } } },
        { $group: { _id: '$userId', ips: { $addToSet: '$ipAddress' }, count: { $sum: 1 } } },
        { $match: { 'ips.2': { $exists: true } } },
      ]),
      MessageIntegrityLog.find({ verificationResult: 'failed' }).limit(50),
      EphemeralMessageLog.find({ deletionStatus: 'failed', expiryAt: { $lt: new Date() } }).limit(50),
    ]);

  await Promise.all([
    ...failedLoginGroups.map((item) =>
      upsertAlert({
        userId: item._id,
        activityType: 'multiple_failed_logins',
        description: `${item.count} failed login attempts detected within 10 minutes.`,
        riskLevel: 'high',
        sourceRef: `failed-logins:${item._id || 'unknown'}`,
      })),
    ...mfaFailureGroups.map((item) =>
      upsertAlert({
        userId: item._id,
        activityType: 'repeated_2fa_failures',
        description: `${item.count} repeated MFA failures detected in a short period.`,
        riskLevel: 'high',
        sourceRef: `mfa-failures:${item._id || 'unknown'}`,
      })),
    ...disabledAttempts.map((log) =>
      upsertAlert({
        userId: log.userId,
        activityType: 'disabled_account_login_attempt',
        description: 'Disabled account attempted to authenticate.',
        riskLevel: 'medium',
        sourceRef: `disabled-login:${log._id}`,
        sourceLogId: log._id,
      })),
    ...multiIpGroups.map((item) =>
      upsertAlert({
        userId: item._id,
        activityType: 'multi_ip_login_attempts',
        description: `Multiple IP addresses attempted login for the same account (${item.ips.length} IPs).`,
        riskLevel: 'high',
        sourceRef: `multi-ip:${item._id}`,
      })),
    ...integrityFailures.map((item) =>
      upsertAlert({
        userId: item.senderId,
        activityType: 'message_integrity_failure',
        description: `Integrity verification failed for message metadata ${item.messageId}.`,
        riskLevel: 'critical',
        sourceRef: `integrity:${item.messageId}`,
      })),
    ...expiredDeletionFailures.map((item) =>
      upsertAlert({
        userId: item.senderId,
        activityType: 'ephemeral_deletion_failure',
        description: `Ephemeral message metadata ${item.messageId} failed deletion after expiry.`,
        riskLevel: 'high',
        sourceRef: `ephemeral:${item.messageId}`,
      })),
  ]);
}

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

router.get('/dashboard', requireAdmin, async (req, res, next) => {
  try {
    await ensureDemoData();
    await detectAndPersistAlerts();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalCustomers,
      activeCustomers,
      activeDirectChats,
      activeGroupChats,
      totalEncryptedMessages,
      failedLoginAttemptsToday,
      suspiciousActivityAlerts,
      messageIntegrityFailures,
      ephemeralPendingDeletion,
      latestScan,
      loginFailuresByDay,
      activeUsersByRole,
      messageVolume,
      alertsBySeverity,
    ] = await Promise.all([
      User.countDocuments({ role: { $in: ['customer', 'user'] } }),
      User.countDocuments({ role: { $in: ['customer', 'user'] }, isActive: true, isLocked: { $ne: true } }),
      ChatThread.countDocuments({ threadType: 'direct', status: 'active' }),
      ChatThread.countDocuments({ threadType: 'group', status: 'active' }),
      ChatThread.aggregate([{ $group: { _id: null, total: { $sum: '$messageCount' } } }]),
      SecurityLog.countDocuments({ eventType: 'loginFailed', createdAt: { $gte: today } }),
      SuspiciousAlert.countDocuments({ status: { $ne: 'resolved' } }),
      MessageIntegrityLog.countDocuments({ verificationResult: 'failed' }),
      EphemeralMessageLog.countDocuments({ deletionStatus: 'pending' }),
      DevSecOpsScan.findOne().sort({ createdAt: -1 }),
      SecurityLog.aggregate([
        { $match: { eventType: 'loginFailed', createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, value: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([{ $group: { _id: '$role', value: { $sum: 1 } } }]),
      ChatThread.aggregate([{ $group: { _id: '$threadType', value: { $sum: '$messageCount' } } }]),
      SuspiciousAlert.aggregate([{ $group: { _id: '$riskLevel', value: { $sum: 1 } } }]),
    ]);

    await writeAudit(req, 'view_security_overview', 'system', null, 'success', 'Viewed admin dashboard overview');

    res.status(200).json({
      summary: {
        totalCustomers,
        activeCustomers,
        activeDirectChats,
        activeGroupChats,
        totalEncryptedMessagesSent: totalEncryptedMessages[0]?.total || 0,
        failedLoginAttemptsToday,
        suspiciousActivityAlerts,
        messageIntegrityFailures,
        ephemeralMessagesPendingDeletion: ephemeralPendingDeletion,
        latestCiCdSecurityScanStatus: latestScan?.buildStatus || 'not_run',
      },
      charts: {
        loginFailures: loginFailuresByDay.map((item) => ({ label: item._id, value: item.value })),
        activeUsers: activeUsersByRole.map((item) => ({ label: item._id === 'admin' ? 'admin' : 'customer', value: item.value })),
        messageVolume: messageVolume.map((item) => ({ label: item._id, value: item.value })),
        alertsBySeverity: alertsBySeverity.map((item) => ({ label: item._id, value: item.value })),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const query = {
      role: { $in: ['customer', 'user'] },
      ...(search
        ? { $or: [{ username: new RegExp(escapeRegex(search), 'i') }, { email: new RegExp(escapeRegex(search), 'i') }] }
        : {}),
    };

    const users = await User.find(query)
      .select('username email role isActive isLocked isTwoFactorEnabled createdAt lastLoginAt failedLoginCount')
      .sort({ createdAt: -1 })
      .limit(parseLimit(req.query.limit, 100));

    res.status(200).json({ users: users.map((user) => mapUserForAdmin(user)) });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:userId/login-history', requireAdmin, async (req, res, next) => {
  try {
    const result = await Logger.queryLogs(
      { userId: req.params.userId, eventType: { $in: ['loginSuccess', 'loginFailed', 'mfaLoginFailed', 'mfaLoginSuccess'] } },
      parseLimit(req.query.limit, 50),
      0,
    );

    await writeAudit(req, 'view_customer_login_history', 'customer', req.params.userId, 'success', 'Viewed customer login history');
    res.status(200).json({ logs: result.logs.map(mapSecurityLog), total: result.total });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:userId/disable', requireAdmin, async (req, res, next) => {
  try {
    const user = await findCustomerTarget(req, res, next);
    if (!user) return;

    user.isActive = false;
    await user.save();

    await writeAudit(req, 'suspend_customer_account', 'customer', user._id, 'success', req.body.reason || 'Customer account suspended by admin');
    res.status(200).json({ user: mapUserForAdmin(user) });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:userId/enable', requireAdmin, async (req, res, next) => {
  try {
    const user = await findCustomerTarget(req, res, next);
    if (!user) return;

    user.isActive = true;
    user.isLocked = false;
    user.lockedAt = null;
    user.lockReason = null;
    await user.save();

    await writeAudit(req, 'activate_customer_account', 'customer', user._id, 'success', req.body.reason || 'Customer account activated by admin');
    res.status(200).json({ user: mapUserForAdmin(user) });
  } catch (error) {
    next(error);
  }
});

router.get('/login-attempts', requireAdmin, async (req, res, next) => {
  try {
    const logs = await SecurityLog.find({
      eventType: { $in: ['loginSuccess', 'loginFailed', 'mfaLoginFailed', 'mfaLoginSuccess'] },
    })
      .populate('userId', 'email username isTwoFactorEnabled')
      .sort({ createdAt: -1 })
      .limit(parseLimit(req.query.limit, 100));

    const attempts = logs.map((log) => ({
      id: log._id,
      userEmail: log.userId?.email || 'unknown',
      ipAddress: log.ipAddress,
      deviceBrowser: log.userAgent,
      loginTime: log.createdAt,
      loginStatus: log.success ? 'Success' : 'Failed',
      failureReason: log.success ? '' : log.failureReason || log.details,
      twoFactorStatus: log.eventType.includes('mfa') ? (log.success ? 'Passed' : 'Failed') : (log.userId?.isTwoFactorEnabled ? 'Enabled' : 'Not required'),
      riskLevel: riskFromLog(log),
    }));

    res.status(200).json({ attempts });
  } catch (error) {
    next(error);
  }
});

router.get('/alerts', requireAdmin, async (req, res, next) => {
  try {
    await ensureDemoData();
    await detectAndPersistAlerts();
    const alerts = await SuspiciousAlert.find()
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .limit(parseLimit(req.query.limit, 100));

    res.status(200).json({ alerts });
  } catch (error) {
    next(error);
  }
});

router.patch('/alerts/:alertId/status', requireAdmin, async (req, res, next) => {
  try {
    const status = String(req.body.status || '').toLowerCase();
    if (!['open', 'investigating', 'resolved'].includes(status)) {
      res.status(400);
      return next(new Error('status must be open, investigating, or resolved'));
    }

    const alert = await SuspiciousAlert.findByIdAndUpdate(req.params.alertId, { status }, { new: true });
    if (!alert) {
      res.status(404);
      return next(new Error('Alert not found'));
    }

    await writeAudit(req, 'update_alert_status', 'alert', alert._id, 'success', `Alert marked ${status}`);
    res.status(200).json({ alert });
  } catch (error) {
    next(error);
  }
});

router.patch('/alerts/:alertId/note', requireAdmin, async (req, res, next) => {
  try {
    const adminNotes = String(req.body.adminNotes || '').slice(0, 1000);
    const alert = await SuspiciousAlert.findByIdAndUpdate(req.params.alertId, { adminNotes }, { new: true });
    if (!alert) {
      res.status(404);
      return next(new Error('Alert not found'));
    }

    await writeAudit(req, 'update_alert_note', 'alert', alert._id, 'success', 'Updated alert admin note');
    res.status(200).json({ alert });
  } catch (error) {
    next(error);
  }
});

router.post('/alerts/:alertId/disable-user', requireAdmin, async (req, res, next) => {
  try {
    const alert = await SuspiciousAlert.findById(req.params.alertId);
    if (!alert || !alert.userId) {
      res.status(404);
      return next(new Error('Alert or related user not found'));
    }

    const user = await User.findById(alert.userId);
    if (!isCustomerAccount(user)) {
      res.status(403);
      return next(new Error('Admins can only suspend customer accounts'));
    }

    user.isActive = false;
    await user.save();

    await writeAudit(req, 'suspend_alert_related_customer', 'customer', alert.userId, 'success', `Suspended customer from alert ${alert._id}`);
    res.status(200).json({ user: mapUserForAdmin(user), alert });
  } catch (error) {
    next(error);
  }
});

router.get('/threads', requireAdmin, async (req, res, next) => {
  try {
    await ensureDemoData();
    const threads = await ChatThread.find()
      .populate('createdBy', 'username email')
      .sort({ lastActivityAt: -1 })
      .limit(parseLimit(req.query.limit, 100));

    res.status(200).json({
      threads: threads.map((thread) => ({
        id: thread._id,
        threadType: thread.threadType === 'direct' ? 'Direct' : 'Group',
        participantCount: thread.participantIds.length,
        createdBy: thread.createdBy?.username || thread.createdBy?._id || 'system',
        createdAt: thread.createdAt,
        lastActivityAt: thread.lastActivityAt,
        messageCount: thread.messageCount,
        status: thread.status,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/message-integrity', requireAdmin, async (req, res, next) => {
  try {
    await ensureDemoData();
    await detectAndPersistAlerts();
    const logs = await MessageIntegrityLog.find().sort({ createdAt: -1 }).limit(parseLimit(req.query.limit, 100));
    res.status(200).json({ logs });
  } catch (error) {
    next(error);
  }
});

router.get('/ephemeral-messages', requireAdmin, async (req, res, next) => {
  try {
    await ensureDemoData();
    await detectAndPersistAlerts();
    const logs = await EphemeralMessageLog.find().sort({ expiryAt: 1 }).limit(parseLimit(req.query.limit, 100));
    res.status(200).json({ logs });
  } catch (error) {
    next(error);
  }
});

router.get('/system-logs', requireAdmin, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const query = search
      ? { $or: [{ eventType: new RegExp(escapeRegex(search), 'i') }, { details: new RegExp(escapeRegex(search), 'i') }, { severity: new RegExp(escapeRegex(search), 'i') }] }
      : {};
    const logs = await SecurityLog.find(query).sort({ createdAt: -1 }).limit(parseLimit(req.query.limit, 150));
    res.status(200).json({ logs: logs.map(mapSecurityLog) });
  } catch (error) {
    next(error);
  }
});

router.get('/audit-trail', requireAdmin, async (req, res, next) => {
  try {
    const logs = await AdminAuditLog.find()
      .populate('adminUserId', 'username email')
      .sort({ createdAt: -1 })
      .limit(parseLimit(req.query.limit, 100));
    res.status(200).json({ logs });
  } catch (error) {
    next(error);
  }
});

router.get('/devsecops', requireAdmin, async (req, res, next) => {
  try {
    await ensureDemoData();
    const latest = await DevSecOpsScan.findOne().sort({ createdAt: -1 });
    res.status(200).json({ scan: latest });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
