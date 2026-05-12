const Logger = require('../services/logger');

/**
 * Socket.IO Logging Handler
 * Logs socket events and anomalies
 */
class SocketLogger {
  /**
   * Log socket connection event
   */
  static async logSocketConnect(socket, user, ipAddress, userAgent) {
    try {
      await Logger.logSocket(
        user ? user._id : null,
        ipAddress,
        userAgent,
        'connect',
        true,
        `Socket connected: ${socket.id}`,
      );
    } catch (error) {
      console.error('SocketLogger.logSocketConnect error:', error);
    }
  }

  /**
   * Log socket authentication success
   */
  static async logSocketAuth(socket, user, ipAddress, userAgent) {
    try {
      await Logger.logSocket(
        user._id,
        ipAddress,
        userAgent,
        'connect',
        true,
        `Socket authenticated: ${socket.id} for user ${user.username}`,
      );
    } catch (error) {
      console.error('SocketLogger.logSocketAuth error:', error);
    }
  }

  /**
   * Log socket authentication failure
   */
  static async logSocketAuthFailure(socket, reason, ipAddress, userAgent) {
    try {
      await Logger.logSocket(
        null,
        ipAddress,
        userAgent,
        'connect',
        false,
        `Socket authentication failed: ${reason}`,
        null,
      );
    } catch (error) {
      console.error('SocketLogger.logSocketAuthFailure error:', error);
    }
  }

  /**
   * Log room join event
   */
  static async logRoomJoin(socket, user, roomId, success, reason = '') {
    try {
      const details = success
        ? `User joined room: ${roomId}`
        : `Failed to join room: ${roomId}. Reason: ${reason}`;

      await Logger.logRoomAccess(
        user ? user._id : null,
        roomId,
        'roomJoined',
        success,
        details,
        success ? 'INFO' : 'WARN',
      );
    } catch (error) {
      console.error('SocketLogger.logRoomJoin error:', error);
    }
  }

  /**
   * Log room leave event
   */
  static async logRoomLeave(socket, user, roomId) {
    try {
      await Logger.logRoomAccess(
        user._id,
        roomId,
        'roomLeft',
        true,
        `User left room: ${roomId}`,
        'INFO',
      );
    } catch (error) {
      console.error('SocketLogger.logRoomLeave error:', error);
    }
  }

  /**
   * Log socket disconnect
   */
  static async logSocketDisconnect(socket, user, ipAddress, userAgent, duration = 0) {
    try {
      await Logger.logSocket(
        user ? user._id : null,
        ipAddress,
        userAgent,
        'disconnect',
        true,
        `Socket disconnected: ${socket.id}`,
        duration,
      );
    } catch (error) {
      console.error('SocketLogger.logSocketDisconnect error:', error);
    }
  }

  /**
   * Log unexpected/abrupt disconnect
   */
  static async logUnexpectedDisconnect(socket, user, ipAddress, userAgent, reason = 'unknown') {
    try {
      await Logger.logSocket(
        user ? user._id : null,
        ipAddress,
        userAgent,
        'disconnect',
        false,
        `Unexpected socket disconnect: ${socket.id}. Reason: ${reason}`,
        null,
      );
    } catch (error) {
      console.error('SocketLogger.logUnexpectedDisconnect error:', error);
    }
  }

  /**
   * Log message sent event
   */
  static async logMessageSent(userId, messageId, roomId, recipientCount = 1) {
    try {
      await Logger.logMessageSecurity(
        userId,
        messageId,
        roomId,
        'messageSent',
        true,
        `Message sent to ${recipientCount} recipient(s)`,
      );
    } catch (error) {
      console.error('SocketLogger.logMessageSent error:', error);
    }
  }

  /**
   * Log message delivered
   */
  static async logMessageDelivered(userId, messageId, roomId) {
    try {
      await Logger.logMessageSecurity(
        userId,
        messageId,
        roomId,
        'messageDelivered',
        true,
        'Message delivered and stored',
      );
    } catch (error) {
      console.error('SocketLogger.logMessageDelivered error:', error);
    }
  }

  /**
   * Log encryption failure
   */
  static async logEncryptionFailure(userId, messageId, reason, ipAddress = null) {
    try {
      await Logger.log({
        eventType: 'encryptionFailed',
        userId,
        messageId,
        ipAddress,
        success: false,
        details: `Message encryption failed: ${reason}`,
        severity: 'WARN',
        failureReason: reason,
      });
    } catch (error) {
      console.error('SocketLogger.logEncryptionFailure error:', error);
    }
  }

  /**
   * Log decryption failure
   */
  static async logDecryptionFailure(userId, messageId, reason, ipAddress = null) {
    try {
      const logEntry = await Logger.log({
        eventType: 'decryptionFailed',
        userId,
        messageId,
        ipAddress,
        success: false,
        details: `Message decryption failed: ${reason}`,
        severity: 'WARN',
        failureReason: reason,
      });

      // Check for anomalies (multiple decryption failures)
      const failures = await Logger.queryLogs(
        {
          userId,
          eventType: 'decryptionFailed',
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        1000,
        0,
      );

      if (failures.total >= 5) {
        await Logger.logDecryptionAnomaly(userId, failures.total, ipAddress, 'CRITICAL');
      }

      return logEntry;
    } catch (error) {
      console.error('SocketLogger.logDecryptionFailure error:', error);
    }
  }

  /**
   * Log message tampering detection
   */
  static async logTamperingDetected(userId, messageId, details, ipAddress = null) {
    try {
      await Logger.logTampering(userId, messageId, details, ipAddress);
    } catch (error) {
      console.error('SocketLogger.logTamperingDetected error:', error);
    }
  }

  /**
   * Log key mismatch (possible MITM)
   */
  static async logKeyMismatch(userId, targetUserId, details, ipAddress = null) {
    try {
      await Logger.log({
        eventType: 'keyMismatchDetected',
        userId,
        targetUserId,
        ipAddress,
        success: false,
        details,
        severity: 'CRITICAL',
      });
    } catch (error) {
      console.error('SocketLogger.logKeyMismatch error:', error);
    }
  }

  /**
   * Log public key operations
   */
  static async logPublicKeyOperation(userId, operationType, success, details) {
    try {
      await Logger.log({
        eventType: `publicKey${operationType.charAt(0).toUpperCase() + operationType.slice(1)}`,
        userId,
        success,
        details,
        severity: success ? 'INFO' : 'WARN',
        encryptionAlgorithm: 'ECDH',
        keyOperationType: operationType,
      });
    } catch (error) {
      console.error('SocketLogger.logPublicKeyOperation error:', error);
    }
  }

  /**
   * Log unauthorized room access attempt
   */
  static async logUnauthorizedRoomAccess(userId, roomId, ipAddress = null) {
    try {
      await Logger.logUnauthorizedAccess(
        userId,
        ipAddress,
        'unauthorizedRoomAccess',
        `Attempted to access unauthorized room: ${roomId}`,
        'WARN',
      );
    } catch (error) {
      console.error('SocketLogger.logUnauthorizedRoomAccess error:', error);
    }
  }

  /**
   * Log unauthorized message access attempt
   */
  static async logUnauthorizedMessageAccess(userId, messageId, ipAddress = null) {
    try {
      await Logger.logUnauthorizedAccess(
        userId,
        ipAddress,
        'unauthorizedMessageRead',
        `Attempted to read unauthorized message: ${messageId}`,
        'WARN',
      );
    } catch (error) {
      console.error('SocketLogger.logUnauthorizedMessageAccess error:', error);
    }
  }

  /**
   * Get logs for debugging/analysis
   */
  static async getSocketLogs(userId, limit = 50) {
    try {
      return await Logger.queryLogs(
        {
          userId,
          eventType: { $regex: /socket|room|message|encryption|decryption|key/ },
        },
        limit,
        0,
      );
    } catch (error) {
      console.error('SocketLogger.getSocketLogs error:', error);
      return { logs: [], total: 0 };
    }
  }
}

module.exports = SocketLogger;
