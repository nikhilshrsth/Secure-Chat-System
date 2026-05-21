const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UserProfile = require('../models/UserProfile');
const { protectAllowInactive } = require('../middleware/authMiddleware');
const { profileSchema, supportedCountries, supportedLanguages } = require('../lib/profileValidation');
const {
  isCloudinaryConfigured,
  uploadProfilePicture,
  deleteProfilePicture,
  extractPublicIdFromUrl,
} = require('../services/cloudinaryService');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_FILE_SIZE) || (2 * 1024 * 1024),
  },
  fileFilter(req, file, cb) {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(extension)) {
      return cb(new Error('Only JPG, PNG, and WEBP images are allowed'));
    }

    cb(null, true);
  },
});

function mapProfile(profile) {
  if (!profile) return null;
  return {
    id: profile._id,
    userId: profile.userId,
    dateOfBirth: profile.dateOfBirth?.toISOString().split('T')[0] || null,
    profilePictureUrl: normalizeProfilePictureUrl(profile.profilePictureUrl),
    alternativeEmail: profile.alternativeEmail,
    country: profile.country,
    preferredLanguage: profile.preferredLanguage,
    themePreference: profile.themePreference,
    phoneNumber: profile.phoneNumber,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function normalizeProfilePictureUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const value = rawUrl.trim();
  if (!value) return null;

  if (value.startsWith('http://') || value.startsWith('https://')) return value;

  const withoutQuery = value.split('?')[0];

  if (withoutQuery.startsWith('/uploads/profile-pictures/')) return withoutQuery;
  if (withoutQuery.startsWith('uploads/profile-pictures/')) return `/${withoutQuery}`;

  // Backward compatibility for old values like /api/profile/picture[/filename]
  if (withoutQuery.startsWith('/api/profile/picture')) {
    const fileName = path.basename(withoutQuery);
    if (fileName && fileName !== 'picture') {
      return `/uploads/profile-pictures/${fileName}`;
    }
    return null;
  }

  return withoutQuery;
}

function removeExistingPicture(profile) {
  if (!profile?.profilePictureUrl) return;

  if (profile.profilePicturePublicId) {
    return deleteProfilePicture(profile.profilePicturePublicId);
  }

  if (profile.profilePictureUrl.startsWith('http')) {
    const fromUrl = extractPublicIdFromUrl(profile.profilePictureUrl);
    if (fromUrl) {
      return deleteProfilePicture(fromUrl);
    }
    return;
  }

  const localDirectory = path.join(__dirname, '..', 'uploads', 'profile-pictures');
  const filePath = path.join(localDirectory, path.basename(profile.profilePictureUrl));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function mapUser(user) {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    role: user.role === 'admin' ? 'admin' : 'customer',
    isActive: user.isActive,
    isTwoFactorEnabled: user.isTwoFactorEnabled,
  };
}

router.get('/', protectAllowInactive, async (req, res, next) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id });
    res.status(200).json({
      user: mapUser(req.user),
      profile: mapProfile(profile),
      supportedCountries,
      supportedLanguages,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', protectAllowInactive, async (req, res, next) => {
  try {
    const parsed = profileSchema.parse(req.body);

    if (parsed.alternativeEmail && parsed.alternativeEmail.toLowerCase() === req.user.email.toLowerCase()) {
      res.status(400);
      return next(new Error('Alternative email must be different from primary email'));
    }

    const existingProfile = await UserProfile.findOne({ userId: req.user._id });
    if (existingProfile) {
      res.status(409);
      return next(new Error('Profile already exists'));
    }

    const profile = await UserProfile.create({
      userId: req.user._id,
      dateOfBirth: parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : null,
      alternativeEmail: parsed.alternativeEmail || null,
      country: parsed.country ? parsed.country.toUpperCase() : null,
      preferredLanguage: parsed.preferredLanguage ? parsed.preferredLanguage.toLowerCase() : null,
      themePreference: parsed.themePreference || 'light',
      phoneNumber: parsed.phoneNumber || null,
    });

    res.status(201).json({ profile: mapProfile(profile) });
  } catch (error) {
    next(error);
  }
});

router.put('/', protectAllowInactive, async (req, res, next) => {
  try {
    const parsed = profileSchema.parse(req.body);

    if (parsed.alternativeEmail && parsed.alternativeEmail.toLowerCase() === req.user.email.toLowerCase()) {
      res.status(400);
      return next(new Error('Alternative email must be different from primary email'));
    }

    const profile = await UserProfile.findOne({ userId: req.user._id });
    if (!profile) {
      res.status(404);
      return next(new Error('Profile not found'));
    }

    profile.dateOfBirth = parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : null;
    profile.alternativeEmail = parsed.alternativeEmail || null;
    profile.country = parsed.country ? parsed.country.toUpperCase() : null;
    profile.preferredLanguage = parsed.preferredLanguage ? parsed.preferredLanguage.toLowerCase() : null;
    profile.themePreference = parsed.themePreference || 'light';
    if (parsed.phoneNumber !== undefined) profile.phoneNumber = parsed.phoneNumber || null;

    await profile.save();

    res.status(200).json({ profile: mapProfile(profile) });
  } catch (error) {
    next(error);
  }
});

router.post('/picture', protectAllowInactive, upload.single('picture'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400);
      return next(new Error('Profile picture is required'));
    }

    if (!isCloudinaryConfigured()) {
      res.status(500);
      return next(new Error('Cloudinary is not configured on the server'));
    }

    const profile = await UserProfile.findOne({ userId: req.user._id });
    if (!profile) {
      res.status(404);
      return next(new Error('Profile not found'));
    }

    await removeExistingPicture(profile);
    const uploadResult = await uploadProfilePicture(req.file.buffer, req.user._id.toString(), req.file.mimetype);
    profile.profilePictureUrl = uploadResult.secure_url;
    profile.profilePicturePublicId = uploadResult.public_id;
    await profile.save();

    res.status(200).json({ profile: mapProfile(profile) });
  } catch (error) {
    next(error);
  }
});

router.delete('/picture', protectAllowInactive, async (req, res, next) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id });
    if (!profile) {
      res.status(404);
      return next(new Error('Profile not found'));
    }

    await removeExistingPicture(profile);
    profile.profilePictureUrl = null;
    profile.profilePicturePublicId = null;
    await profile.save();

    res.status(200).json({ profile: mapProfile(profile) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
