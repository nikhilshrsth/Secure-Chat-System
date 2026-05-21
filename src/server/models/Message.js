const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatThread',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    roomId: {
      type: String,
      default: null,
      index: true,
    },
    ciphertext: {
      type: String,
      required: true,
    },
    iv: {
      type: String,
      required: true,
    },
    authTag: {
      type: String,
      required: true,
    },
    algorithm: {
      type: String,
      default: 'aes-256-gcm',
    },
    integrityHash: {
      type: String,
      default: null,
      index: true,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    deleteAfterReadSeconds: {
      type: Number,
      default: null,
      min: 5,
      max: 86400,
    },
    deletedFor: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    deletedForEveryone: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Message', messageSchema);
