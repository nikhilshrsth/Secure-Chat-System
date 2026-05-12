const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UserProfile = require('../models/UserProfile');
const { protect } = require('../middleware/authMiddleware');
const { profileSchema, supportedCountries, supportedLanguages } = require('../lib/profileValidation');

const router = express.Router();

const uploadDirectory = path.join(__dirname, '..', 'uploads', 'profile-pictures');
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, uploadDirectory);
    },
    filename(req, file, cb) {
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.user._id.toString()}-${Date.now()}${extension}`);
    },
  }),
  limits: {
    fileSize: 2 * 1024 * 1024,
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
    profilePictureUrl: profile.profilePictureUrl,
    alternativeEmail: profile.alternativeEmail,
    country: profile.country,
    preferredLanguage: profile.preferredLanguage,
    themePreference: profile.themePreference,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function removeExistingPicture(profile) {
  if (!profile?.profilePictureUrl) return;
  const filePath = path.join(uploadDirectory, path.basename(profile.profilePictureUrl));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

router.get('/', protect, async (req, res, next) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id });
    res.status(200).json({
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
      },
      profile: mapProfile(profile),
      supportedCountries,
      supportedLanguages,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', protect, async (req, res, next) => {
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
    });

    res.status(201).json({ profile: mapProfile(profile) });
  } catch (error) {
    next(error);
  }
});

router.put('/', protect, async (req, res, next) => {
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

    await profile.save();

    res.status(200).json({ profile: mapProfile(profile) });
  } catch (error) {
    next(error);
  }
});

router.post('/picture', protect, upload.single('picture'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400);
      return next(new Error('Profile picture is required'));
    }

    const profile = await UserProfile.findOne({ userId: req.user._id });
    if (!profile) {
      res.status(404);
      return next(new Error('Profile not found'));
    }

    removeExistingPicture(profile);
    profile.profilePictureUrl = `/uploads/profile-pictures/${req.file.filename}`;
    await profile.save();

    res.status(200).json({ profile: mapProfile(profile) });
  } catch (error) {
    next(error);
  }
});

router.delete('/picture', protect, async (req, res, next) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id });
    if (!profile) {
      res.status(404);
      return next(new Error('Profile not found'));
    }

    removeExistingPicture(profile);
    profile.profilePictureUrl = null;
    await profile.save();

    res.status(200).json({ profile: mapProfile(profile) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
