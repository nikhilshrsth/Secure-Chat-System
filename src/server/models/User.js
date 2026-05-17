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
      enum: ['user', 'admin'],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
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
  },
  {
    timestamps: true,
  },
);

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
