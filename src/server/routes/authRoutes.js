const express = require('express');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Logger = require('../services/logger');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return process.env.JWT_SECRET;
}

function generateToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
    },
    getJwtSecret(),
    {
      expiresIn: '7d',
    },
  );
}

router.post('/register', async (req, res, next) => {
  const logContext = req.logContext || {};
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      res.status(400);
      await Logger.logRegistration(
        null,
        logContext.ipAddress,
        logContext.userAgent,
        false,
        'Missing required fields: username, email, password',
        'WARN',
      );
      return next(new Error('username, email, and password are required'));
    }

    if (password.length < 8) {
      res.status(400);
      await Logger.logRegistration(
        null,
        logContext.ipAddress,
        logContext.userAgent,
        false,
        'Password too short (< 8 characters)',
        'WARN',
      );
      return next(new Error('password must be at least 8 characters'));
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      res.status(409);
      await Logger.logRegistration(
        existingUser._id,
        logContext.ipAddress,
        logContext.userAgent,
        false,
        'Registration attempted with existing email',
        'WARN',
      );
      return next(new Error('User already exists'));
    }

    const user = await User.create({
      username,
      email: normalizedEmail,
      passwordHash: password,
      role: 'user',
    });

    // Log successful registration
    await Logger.logRegistration(
      user._id,
      logContext.ipAddress,
      logContext.userAgent,
      true,
      `User registered: ${username} (${email})`,
      'INFO',
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  const logContext = req.logContext || {};
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400);
      await Logger.logAuthAttempt(
        null,
        logContext.ipAddress,
        logContext.userAgent,
        false,
        'Missing email or password',
        'WARN',
      );
      return next(new Error('email and password are required'));
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!user) {
      res.status(401);
      await Logger.logAuthAttempt(
        null,
        logContext.ipAddress,
        logContext.userAgent,
        false,
        `Login attempt for non-existent user: ${email}`,
        'WARN',
      );
      return next(new Error('Invalid credentials'));
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      res.status(401);

      // Check for multiple failed login attempts (potential brute force)
      const failedAttempts = await Logger.getFailedLoginAttempts(user._id, 1); // Last 1 hour
      const attemptCount = failedAttempts.total + 1;

      await Logger.logAuthAttempt(
        user._id,
        logContext.ipAddress,
        logContext.userAgent,
        false,
        `Failed login attempt (attempt #${attemptCount})`,
        attemptCount >= 5 ? 'WARN' : 'INFO',
      );

      // Log anomaly if too many attempts
      if (attemptCount >= 5) {
        await Logger.log({
          eventType: 'bruteForceLoginDetected',
          userId: user._id,
          ipAddress: logContext.ipAddress,
          success: false,
          details: `${attemptCount} failed login attempts in 1 hour`,
          severity: 'CRITICAL',
          attemptCount,
        });
      }

      return next(new Error('Invalid credentials'));
    }

    // Check if user is active
    if (!user.isActive) {
      res.status(403);
      await Logger.logAuthAttempt(
        user._id,
        logContext.ipAddress,
        logContext.userAgent,
        false,
        'Login attempt on disabled account',
        'WARN',
      );
      return next(new Error('User account is disabled'));
    }

    const token = generateToken(user);

    // Log successful login
    await Logger.logAuthAttempt(
      user._id,
      logContext.ipAddress,
      logContext.userAgent,
      true,
      `Successful login: ${email}`,
      'INFO',
    );

    res.status(200).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', protect, async (req, res) => {
  res.status(200).json({
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      isActive: req.user.isActive,
    },
  });
});

module.exports = router;