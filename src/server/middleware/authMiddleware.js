const jwt = require('jsonwebtoken');

const User = require('../models/User');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return process.env.JWT_SECRET;
}

async function protect(req, res, next) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    res.status(401);
    return next(new Error('Not authorized, token missing'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.userId).select('-passwordHash');

    if (!user || !user.isActive) {
      res.status(401);
      return next(new Error('Not authorized, user not found or inactive'));
    }

    req.user = user;
    return next();
  } catch (error) {
    res.status(401);
    return next(new Error('Not authorized, token invalid'));
  }
}

async function protectAllowInactive(req, res, next) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    res.status(401);
    return next(new Error('Not authorized, token missing'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.userId).select('-passwordHash');

    if (!user) {
      res.status(401);
      return next(new Error('Not authorized, user not found'));
    }

    req.user = user;
    return next();
  } catch (error) {
    res.status(401);
    return next(new Error('Not authorized, token invalid'));
  }
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401);
      return next(new Error('Not authorized'));
    }

    if (!roles.includes(req.user.role)) {
      res.status(403);
      return next(new Error('Forbidden: insufficient role'));
    }

    return next();
  };
}

const adminOnly = authorizeRoles('admin');

module.exports = {
  protect,
  protectAllowInactive,
  authorizeRoles,
  adminOnly,
};