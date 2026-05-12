const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    profilePictureUrl: {
      type: String,
      default: null,
    },
    alternativeEmail: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },
    country: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
    },
    preferredLanguage: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    themePreference: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light',
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('UserProfile', userProfileSchema);
