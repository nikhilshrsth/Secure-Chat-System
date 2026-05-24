const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isLocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockReason: {
      type: String,
      default: null,
      maxlength: 300,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    failedLoginCount: {
      type: Number,
      default: 0,
    },
    twoFactorSecret: {
      type: String,
      default: null,
      select: false,
    },
    isTwoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    publicKey: {
      type: String,
      default: null,
    },
    keyExchangePublicKey: {
      type: String,
      default: null,
    },
    // Passphrase-wrapped identity backup for multi-device sign-in.
    // The server stores only ciphertext + KDF params; it cannot read the
    // private keys without the user-chosen passphrase.
    encryptedIdentityBackup: {
      ciphertext: { type: String, default: null },
      iv: { type: String, default: null },
      salt: { type: String, default: null },
      iterations: { type: Number, default: null },
      algorithm: { type: String, default: null },
      publicKeyFingerprint: { type: String, default: null },
      updatedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
  },
);

userSchema.pre('validate', function normalizeLegacyRole() {
  if (this.role === 'user') {
    this.role = 'customer';
  }
});

userSchema.pre('save', async function hashPasswordHash() {
  if (!this.isModified('passwordHash')) {
    return;
  }

  // Skip if the value already looks like a bcrypt hash.
  if (typeof this.passwordHash === 'string' && this.passwordHash.startsWith('$2')) {
    return;
  }

  const saltRounds = Number(process.env.BCRYPT_ROUNDS) || 12;
  this.passwordHash = await bcrypt.hash(this.passwordHash, saltRounds);
});

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  if (!this.passwordHash) {
    return false;
  }

  return bcrypt.compare(plainPassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
