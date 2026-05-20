const mongoose = require('mongoose');

const encryptedMessageSchema = new mongoose.Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    algorithm: { type: String, default: 'aes-256-gcm' },
  },
  { _id: false },
);

const participantKeySchema = new mongoose.Schema(
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
  { _id: false },
);

const chatRequestSchema = new mongoose.Schema(
  {
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
      index: true,
    },
    lockAfterRejection: {
      type: Boolean,
      default: false,
    },
    initialMessage: {
      type: encryptedMessageSchema,
      required: true,
    },
    participantKeys: {
      type: [participantKeySchema],
      default: [],
    },
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatThread',
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

chatRequestSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });

module.exports = mongoose.model('ChatRequest', chatRequestSchema);
