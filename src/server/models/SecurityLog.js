const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema(
  {
    // Core identification
    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
      maxlength: 500,
    },

    // Contextual relationships
    roomId: {
      type: String,
      default: null,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    // Classification
    severity: {
      type: String,
      enum: ['INFO', 'WARN', 'CRITICAL'],
      default: 'INFO',
      index: true,
    },
    success: {
      type: Boolean,
      required: true,
    },
    details: {
      type: String,
      default: '',
      maxlength: 500,
    },

    // Crypto-specific fields
    encryptionAlgorithm: {
      type: String,
      default: null,
    },
    keyOperationType: {
      type: String,
      enum: ['generate', 'rotate', 'exchange', null],
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },

    // Pattern detection for abuse
    attemptCount: {
      type: Number,
      default: 1,
    },
    timeSinceLastAttempt: {
      type: Number,
      default: null,
    },

    // Socket/connectivity fields
    socketEventType: {
      type: String,
      enum: ['connect', 'disconnect', 'error', null],
      default: null,
    },
    connectionDuration: {
      type: Number,
      default: null,
    },

    // Event timestamp (for ordering when multiple events occur)
    eventTime: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
    indexes: [
      { userId: 1, createdAt: -1 },
      { eventType: 1, createdAt: -1 },
      { severity: 1, createdAt: -1 },
    ],
  },
);

// TTL index to automatically delete logs after 90 days
securityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model('SecurityLog', securityLogSchema);
