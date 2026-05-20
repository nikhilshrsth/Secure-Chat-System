const mongoose = require('mongoose');

const chatThreadSchema = new mongoose.Schema(
  {
    threadType: {
      type: String,
      enum: ['direct', 'group'],
      required: true,
      index: true,
    },
    participantIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastActivityAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'archived', 'suspicious'],
      default: 'active',
      index: true,
    },
    metadataOnly: {
      type: Boolean,
      default: true,
    },
    encryptedKeys: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        encryptedKey: {
          type: String,
          required: true,
        },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model('ChatThread', chatThreadSchema);
