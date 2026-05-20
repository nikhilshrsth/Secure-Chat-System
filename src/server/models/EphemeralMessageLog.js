const mongoose = require('mongoose');

const ephemeralMessageLogSchema = new mongoose.Schema(
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
    expiryAt: {
      type: Date,
      required: true,
      index: true,
    },
    deletionStatus: {
      type: String,
      enum: ['pending', 'deleted', 'failed'],
      default: 'pending',
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
      maxlength: 300,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('EphemeralMessageLog', ephemeralMessageLogSchema);
