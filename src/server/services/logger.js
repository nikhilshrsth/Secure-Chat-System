const SecurityLog = require('../models/SecurityLog');

/**
 * Logger Service - Handles all security logging operations
 * Provides methods for logging project-specific security events
 */
class Logger {
  /**
   * Create a security log entry
   * @param {Object} options - Log options
   * @param {String} options.eventType - Type of event
   * @param {String} options.userId - User ID who triggered event
   * @param {String} options.targetUserId - User affected by event (optional)
   * @param {String} options.ipAddress - IP address of requester
   * @param {String} options.userAgent - User agent string
   * @param {Boolean} options.success - Did operation succeed?
   * @param {String} options.details - Human-readable description
   * @param {String} options.severity - 'INFO', 'WARN', 'CRITICAL'
   * @param {String} options.roomId - Chat room context (optional)
   * @param {String} options.messageId - Message ID (optional)
   * @param {String} options.encryptionAlgorithm - Algorithm used (optional)
   * @param {String} options.keyOperationType - 'generate', 'rotate', 'exchange' (optional)
   * @param {String} options.failureReason - Why it failed (optional)
   * @param {Number} options.attemptCount - Attempt number (optional)
   * @param {Number} options.timeSinceLastAttempt - Time since last attempt (optional)
   * @param {String} options.socketEventType - 'connect', 'disconnect', 'error' (optional)
   * @param {Number} options.connectionDuration - Duration in ms (optional)
   */
  static async log(options) {
    try {
      const {
        eventType,
        userId = null,
        targetUserId = null,
        ipAddress = null,
        userAgent = null,
        success = true,
        details = '',
        severity = 'INFO',
        roomId = null,
        messageId = null,
        encryptionAlgorithm = null,
        keyOperationType = null,
        failureReason = null,
        attemptCount = 1,
        timeSinceLastAttempt = null,
        socketEventType = null,
        connectionDuration = null,
      } = options;

      // Determine severity automatically if not provided
      let finalSeverity = severity;
      if (severity === 'INFO' && !success) {
        finalSeverity = this._determineSeverity(eventType, success, attemptCount);
      }

      const logEntry = new SecurityLog({
        eventType,
        userId,
        targetUserId,
        ipAddress,
        userAgent,
        success,
        details,
        severity: finalSeverity,
        roomId,
        messageId,
        encryptionAlgorithm,
        keyOperationType,
        failureReason,
        attemptCount,
        timeSinceLastAttempt,
        socketEventType,
        connectionDuration,
        eventTime: new Date(),
      });

      await logEntry.save();
      return logEntry;
    } catch (error) {
      console.error('Logger.log() error:', error);
      // Don't throw - logging failures should not break the app
    }
  }

  /**
   * Log authentication attempts
   */
  static async logAuthAttempt(userId, ipAddress, userAgent, success, details, severity = 'INFO') {
    return this.log({
      eventType: success ? 'loginSuccess' : 'loginFailed',
      userId,
      ipAddress,
      userAgent,
      success,
      details,
      severity,
    });
  }

  /**
   * Log registration attempts
   */
  static async logRegistration(userId, ipAddress, userAgent, success, details, severity = 'INFO') {
    return this.log({
      eventType: 'userRegistration',
      userId,
      ipAddress,
      userAgent,
      success,
      details,
      severity,
    });
  }

  /**
   * Log 2FA events
   */
  static async log2FA(userId, ipAddress, userAgent, eventType, success, details, severity = 'INFO') {
    return this.log({
      eventType,
      userId,
      ipAddress,
      userAgent,
      success,
      details,
      severity,
    });
  }

  /**
   * Log multiple failed 2FA attempts with anomaly detection
   */
  static async log2FAAnomaly(userId, ipAddress, userAgent, attemptCount, severity = 'WARN') {
    return this.log({
      eventType: 'multipleFailedTwoFAAttempts',
      userId,
      ipAddress,
      userAgent,
      success: false,
      details: `${attemptCount} failed 2FA attempts detected`,
      severity,
      attemptCount,
    });
  }

  /**
   * Log encryption operations
   */
  static async logEncryption(
    userId,
    eventType,
    success,
    details,
    encryptionAlgorithm = 'AES-GCM',
    failureReason = null,
  ) {
    return this.log({
      eventType,
      userId,
      success,
      details,
      severity: success ? 'INFO' : 'WARN',
      encryptionAlgorithm,
      failureReason,
    });
  }

  /**
   * Log key operations (generate, rotate, exchange)
   */
  static async logKeyOperation(
    userId,
    keyOperationType,
    success,
    details,
    encryptionAlgorithm = 'ECDH',
    severity = 'INFO',
  ) {
    return this.log({
      eventType: 'keyOperation',
      userId,
      success,
      details,
      severity,
      encryptionAlgorithm,
      keyOperationType,
    });
  }

  /**
   * Log message security events
   */
  static async logMessageSecurity(
    userId,
    messageId,
    roomId,
    eventType,
    success,
    details,
    failureReason = null,
  ) {
    return this.log({
      eventType,
      userId,
      messageId,
      roomId,
      success,
      details,
      severity: success ? 'INFO' : 'WARN',
      failureReason,
    });
  }

  /**
   * Log message tampering (CRITICAL)
   */
  static async logTampering(userId, messageId, details, ipAddress = null) {
    return this.log({
      eventType: 'messageContentTampered',
      userId,
      messageId,
      ipAddress,
      success: false,
      details,
      severity: 'CRITICAL',
      failureReason: 'tampered',
    });
  }

  /**
   * Log decryption failures with anomaly detection
   */
  static async logDecryptionAnomaly(
    userId,
    failureCount,
    ipAddress = null,
    severity = 'WARN',
  ) {
    return this.log({
      eventType: 'multipleDecryptionFailures',
      userId,
      ipAddress,
      success: false,
      details: `${failureCount} failed decryption attempts detected`,
      severity,
      attemptCount: failureCount,
    });
  }

  /**
   * Log Socket.IO events
   */
  static async logSocket(
    userId,
    ipAddress,
    userAgent,
    socketEventType,
    success,
    details,
    connectionDuration = null,
  ) {
    return this.log({
      eventType: `socket${socketEventType.charAt(0).toUpperCase() + socketEventType.slice(1)}`,
      userId,
      ipAddress,
      userAgent,
      success,
      details,
      severity: success ? 'INFO' : 'WARN',
      socketEventType,
      connectionDuration,
    });
  }

  /**
   * Log room access
   */
  static async logRoomAccess(userId, roomId, eventType, success, details, severity = 'INFO') {
    return this.log({
      eventType,
      userId,
      roomId,
      success,
      details,
      severity,
    });
  }

  /**
   * Log unauthorized access attempts
   */
  static async logUnauthorizedAccess(userId, ipAddress, eventType, details, severity = 'WARN') {
    return this.log({
      eventType,
      userId,
      ipAddress,
      success: false,
      details,
      severity,
    });
  }

  /**
   * Log admin actions
   */
  static async logAdminAction(adminId, targetUserId, eventType, success, details, severity = 'INFO') {
    return this.log({
      eventType,
      userId: adminId,
      targetUserId,
      success,
      details,
      severity,
    });
  }

  /**
   * Log potential man-in-the-middle attacks
   */
  static async logMITMSuspicion(userId, details, ipAddress = null, severity = 'CRITICAL') {
    return this.log({
      eventType: 'possibleManInTheMiddleAttack',
      userId,
      ipAddress,
      success: false,
      details,
      severity,
    });
  }

  /**
   * Query logs with filters
   */
  static async queryLogs(filters = {}, limit = 50, skip = 0) {
    try {
      const query = SecurityLog.find(filters)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      const logs = await query.exec();
      const total = await SecurityLog.countDocuments(filters);

      return {
        logs,
        total,
        limit,
        skip,
        hasMore: skip + limit < total,
      };
    } catch (error) {
      console.error('Logger.queryLogs() error:', error);
      return { logs: [], total: 0, error: error.message };
    }
  }

  /**
   * Get logs for a specific user
   */
  static async getUserLogs(userId, limit = 50) {
    return this.queryLogs({ userId }, limit, 0);
  }

  /**
   * Get critical security events
   */
  static async getCriticalEvents(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.queryLogs(
      { severity: 'CRITICAL', createdAt: { $gte: since } },
      100,
      0,
    );
  }

  /**
   * Get failed login attempts for a user
   */
  static async getFailedLoginAttempts(userId, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.queryLogs(
      {
        userId,
        eventType: 'loginFailed',
        createdAt: { $gte: since },
      },
      100,
      0,
    );
  }

  /**
   * Detect suspicious patterns
   */
  static async detectAnomalies() {
    const results = {
      multipleFailedLogins: [],
      multipleFailedTwoFA: [],
      multipleDecryptionFailures: [],
      possibleMITM: [],
    };

    try {
      // Find users with multiple failed logins in last hour
      const loginAnomalies = await SecurityLog.aggregate([
        {
          $match: {
            eventType: 'loginFailed',
            createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
          },
        },
        {
          $match: { count: { $gte: 5 } },
        },
      ]);

      results.multipleFailedLogins = loginAnomalies;

      // Find users with multiple failed 2FA attempts
      const twoFAAnomalies = await SecurityLog.aggregate([
        {
          $match: {
            eventType: 'twoFAVerificationFailed',
            createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
          },
        },
        {
          $match: { count: { $gte: 3 } },
        },
      ]);

      results.multipleFailedTwoFA = twoFAAnomalies;

      // Find users with multiple decryption failures
      const decryptionAnomalies = await SecurityLog.aggregate([
        {
          $match: {
            eventType: 'decryptionFailed',
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
          },
        },
        {
          $match: { count: { $gte: 5 } },
        },
      ]);

      results.multipleDecryptionFailures = decryptionAnomalies;

      // Find possible MITM attacks (key mismatches)
      const mitmAnomalies = await SecurityLog.aggregate([
        {
          $match: {
            eventType: 'keyMismatchDetected',
            createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
          },
        },
        {
          $match: { count: { $gte: 2 } },
        },
      ]);

      results.possibleMITM = mitmAnomalies;

      return results;
    } catch (error) {
      console.error('Logger.detectAnomalies() error:', error);
      return results;
    }
  }

  /**
   * Determine severity based on event type and context
   * @private
   */
  static _determineSeverity(eventType, success, attemptCount = 1) {
    const criticalEvents = [
      'possibleManInTheMiddleAttack',
      'messageContentTampered',
      'multipleDecryptionFailures',
      'multipleFailedTwoFAAttempts',
      'cryptoAPIError',
      'unauthorizedRoomAccess',
      'unauthorizedMessageRead',
    ];

    if (criticalEvents.includes(eventType)) {
      return 'CRITICAL';
    }

    if (!success && attemptCount >= 3) {
      return 'WARN';
    }

    return success ? 'INFO' : 'WARN';
  }
}

module.exports = Logger;
