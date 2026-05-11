const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
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
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('SecurityLog', securityLogSchema);
