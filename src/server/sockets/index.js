const jwt = require('jsonwebtoken');

const User = require('../models/User');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return process.env.JWT_SECRET;
}

function extractSocketToken(socket) {
  const authToken = socket.handshake.auth?.token;
  if (authToken) {
    return String(authToken).replace(/^Bearer\s+/i, '');
  }

  const authHeader = socket.handshake.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  return null;
}

function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const token = extractSocketToken(socket);

      if (!token) {
        return next(new Error('Not authorized, token missing'));
      }

      const decoded = jwt.verify(token, getJwtSecret());
      const user = await User.findById(decoded.userId).select('-passwordHash');

      if (!user) {
        return next(new Error('Not authorized, user not found'));
      }

      if (!user.isActive || !user.isPhoneVerified) {
        return next(new Error('Account activation required before chat access'));
      }

      socket.user = user;
      return next();
    } catch (error) {
      return next(new Error('Not authorized, token invalid'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('room:join', (roomId) => {
      if (!roomId) {
        return;
      }
      socket.join(roomId);
    });
  });
}

module.exports = registerSocketHandlers;
