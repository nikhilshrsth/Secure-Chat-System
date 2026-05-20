const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema(
  {
    adminUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ['customer', 'thread', 'alert', 'system', 'scan'],
      default: 'system',
    },
    targetId: {
      type: String,
      default: null,
      trim: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    result: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
    },
    reason: {
      type: String,
      default: '',
      maxlength: 500,
    },
  },
  { timestamps: true },
);

adminAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
