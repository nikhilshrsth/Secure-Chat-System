const mongoose = require('mongoose');

const suspiciousAlertSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    activityType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 700,
    },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved'],
      default: 'open',
      index: true,
    },
    adminNotes: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    sourceLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SecurityLog',
      default: null,
    },
    sourceRef: {
      type: String,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

suspiciousAlertSchema.index({ activityType: 1, sourceRef: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('SuspiciousAlert', suspiciousAlertSchema);
