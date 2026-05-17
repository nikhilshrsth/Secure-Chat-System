const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const User = require('../models/User');
const Logger = require('../services/logger');
const { verifyGoogleIdToken } = require('../services/googleAuthService');
const emailOtpService = require('../services/emailOtpService');
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

function generateMfaToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      purpose: 'mfa-login',
    },
    getJwtSecret(),
    {
      expiresIn: '10m',
    },
  );
}

function mapUserResponse(user) {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    isTwoFactorEnabled: user.isTwoFactorEnabled,
  };
}

async function issueMfaChallengeResponse(res, user, logContext, source) {
  const mfaToken = generateMfaToken(user);

  await Logger.log2FA(
    user._id,
    logContext.ipAddress,
    logContext.userAgent,
    'mfaChallengeSent',
    true,
    `Authenticator MFA challenge started from ${source}`,
    'INFO',
  );

  res.status(200).json({
    mfaRequired: true,
    mfaToken,
    message: 'Enter the code from your authenticator app.',
  });
}

// Registration with OTP email confirmation
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
      return next(new Error('full name, email, and password are required'));
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

    // Create user but set isActive to false until email is verified
    const user = await User.create({
      username,
      email: normalizedEmail,
      passwordHash: password,
      isPhoneVerified: false,
      isActive: false,
      isTwoFactorEnabled: false,
      role: 'user',
    });

    // Generate and send OTP (email failure is non-fatal — OTP is still stored)
    const otp = emailOtpService.generateOtp();
    emailOtpService.storeOtp(normalizedEmail, otp);
    try {
      await emailOtpService.sendOtpEmail(normalizedEmail, otp);
    } catch (emailError) {
      console.error('[emailOtpService] Failed to send OTP email:', emailError.message);
    }

    await Logger.logRegistration(
      user._id,
      logContext.ipAddress,
      logContext.userAgent,
      true,
      `User registered (pending email verification): ${username} (${email})`,
      'INFO',
    );

    res.status(201).json({
      message: 'Account created. Please check your email for the confirmation code.',
      user: mapUserResponse(user),
    });
  } catch (error) {
    next(error);
  }
});

// Email OTP verification endpoint
router.post('/verify-email', async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400);
      return next(new Error('Email and OTP are required'));
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(404);
      return next(new Error('User not found'));
    }
    if (user.isActive) {
      res.status(400);
      return next(new Error('Email already verified'));
    }
    const valid = emailOtpService.verifyOtp(normalizedEmail, otp);
    if (!valid) {
      res.status(400);
      return next(new Error('Invalid or expired OTP'));
    }
    user.isActive = true;
    await user.save();
    res.status(200).json({ message: 'Email verified. You can now log in.' });
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
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash +twoFactorSecret');

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

    if (user.isTwoFactorEnabled && user.twoFactorSecret) {
      await issueMfaChallengeResponse(res, user, logContext, 'password login');
      return;
    }

    const token = generateToken(user);
    await Logger.logAuthAttempt(
      user._id,
      logContext.ipAddress,
      logContext.userAgent,
      true,
      `Successful login without MFA: ${user.email}`,
      'INFO',
    );

    res.status(200).json({
      token,
      user: mapUserResponse(user),
    });
  } catch (error) {
    if (res.statusCode === 200 && error.statusCode) {
      res.status(error.statusCode);
    }
    next(error);
  }
});

router.post('/google', async (req, res, next) => {
  const logContext = req.logContext || {};

  try {
    const { idToken } = req.body;
    const googleUser = await verifyGoogleIdToken(idToken);

    if (!googleUser.emailVerified) {
      res.status(401);
      return next(new Error('Google account email is not verified'));
    }

    const normalizedEmail = String(googleUser.email).toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail }).select('+twoFactorSecret');

    if (!user) {
      user = await User.create({
        username: googleUser.username,
        email: normalizedEmail,
        passwordHash: crypto.randomBytes(24).toString('hex'),
        role: 'user',
        authProvider: 'google',
        googleId: googleUser.googleId,
        isPhoneVerified: false,
        isActive: true,
        isTwoFactorEnabled: false,
      });
    } else {
      user.authProvider = 'google';
      if (!user.googleId) {
        user.googleId = googleUser.googleId;
      }
      await user.save();
    }

    if (!user.isActive) {
      res.status(403);
      return next(new Error('User account is disabled'));
    }

    if (user.isTwoFactorEnabled && user.twoFactorSecret) {
      await issueMfaChallengeResponse(res, user, logContext, 'Google sign-in');
      return;
    }

    const token = generateToken(user);
    res.status(200).json({
      token,
      user: mapUserResponse(user),
    });
  } catch (error) {
    if (res.statusCode === 200) {
      if (error.statusCode) {
        res.status(error.statusCode);
      } else {
        // Invalid/misconfigured Google credentials should be treated as auth failures, not server errors.
        res.status(401);
      }
    }

    next(error);
  }
});

router.post('/mfa/verify-login', async (req, res, next) => {
  const logContext = req.logContext || {};

  try {
    const { mfaToken, code } = req.body;

    if (!mfaToken || !code) {
      res.status(400);
      return next(new Error('mfaToken and code are required'));
    }

    let decoded;
    try {
      decoded = jwt.verify(mfaToken, getJwtSecret());
    } catch (error) {
      res.status(401);
      return next(new Error('Invalid or expired MFA token'));
    }

    if (!decoded || decoded.purpose !== 'mfa-login' || !decoded.userId) {
      res.status(401);
      return next(new Error('Invalid MFA token payload'));
    }

    const user = await User.findById(decoded.userId).select('+twoFactorSecret');

    if (!user || !user.isActive || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
      res.status(401);
      return next(new Error('User is not eligible for MFA verification'));
    }

    const isCodeValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: String(code).trim(),
      window: 1,
    });

    if (!isCodeValid) {
      const failedAttempts = await Logger.queryLogs(
        {
          userId: user._id,
          eventType: 'mfaLoginFailed',
          createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        100,
        0,
      );

      const attemptCount = (failedAttempts.total || 0) + 1;

      await Logger.log2FA(
        user._id,
        logContext.ipAddress,
        logContext.userAgent,
        'mfaLoginFailed',
        false,
        `Failed MFA verification (attempt #${attemptCount})`,
        attemptCount >= 5 ? 'WARN' : 'INFO',
      );

      if (attemptCount >= 5) {
        await Logger.log2FAAnomaly(
          user._id,
          logContext.ipAddress,
          logContext.userAgent,
          attemptCount,
          'CRITICAL',
        );
      }

      res.status(401);
      return next(new Error('Invalid MFA code'));
    }

    const token = generateToken(user);

    await Logger.logAuthAttempt(
      user._id,
      logContext.ipAddress,
      logContext.userAgent,
      true,
      `Successful login with MFA: ${user.email}`,
      'INFO',
    );

    await Logger.log2FA(
      user._id,
      logContext.ipAddress,
      logContext.userAgent,
      'mfaLoginSuccess',
      true,
      'MFA verification completed successfully',
      'INFO',
    );

    res.status(200).json({
      token,
      user: mapUserResponse(user),
    });
  } catch (error) {
    if (res.statusCode === 200 && error.statusCode) {
      res.status(error.statusCode);
    }
    next(error);
  }
});

router.post('/mfa/setup', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+twoFactorSecret');

    if (!user) {
      res.status(404);
      return next(new Error('User not found'));
    }

    const issuer = process.env.TOTP_ISSUER || 'SecureChat';
    const secret = speakeasy.generateSecret({
      name: `${issuer} (${user.email})`,
      issuer,
      length: 32,
    });

    user.twoFactorSecret = secret.base32;
    user.isTwoFactorEnabled = false;
    await user.save();

    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      qrCodeDataUrl,
      secret: secret.base32,
      message: 'Scan the QR code with your authenticator app and confirm with a generated code.',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/enable', protect, async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      res.status(400);
      return next(new Error('code is required'));
    }

    const user = await User.findById(req.user._id).select('+twoFactorSecret');

    if (!user || !user.twoFactorSecret) {
      res.status(400);
      return next(new Error('MFA setup is not initialized'));
    }

    const isCodeValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: String(code).trim(),
      window: 1,
    });

    if (!isCodeValid) {
      res.status(400);
      return next(new Error('Invalid authenticator code'));
    }

    user.isTwoFactorEnabled = true;
    await user.save();

    res.status(200).json({
      message: 'Authenticator MFA enabled successfully.',
      user: mapUserResponse(user),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/disable', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      res.status(404);
      return next(new Error('User not found'));
    }

    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = null;
    await user.save();

    res.status(200).json({
      message: 'Authenticator MFA disabled.',
      user: mapUserResponse(user),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', protect, async (req, res) => {
  res.status(200).json({
    user: mapUserResponse(req.user),
  });
});

module.exports = router;