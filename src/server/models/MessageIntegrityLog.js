const mongoose = require('mongoose');

const messageIntegrityLogSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    threadId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    hashStatus: {
      type: String,
      enum: ['present', 'missing', 'mismatch'],
      default: 'present',
    },
    verificationResult: {
      type: String,
      enum: ['valid', 'failed'],
      required: true,
      index: true,
    },
    actionTaken: {
      type: String,
      default: 'none',
      maxlength: 300,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('MessageIntegrityLog', messageIntegrityLogSchema);
