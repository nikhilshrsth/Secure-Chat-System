const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { assertThreadAccess, listThreadsForUser, sendMessage } = require('../services/chatService');

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

async function joinUserChatRooms(socket) {
  const userId = String(socket.user._id);
  socket.join(`user:${userId}`);

  const threads = await listThreadsForUser(socket.user._id);
  threads.forEach((thread) => {
    socket.join(String(thread.id));
  });

  return threads.length;
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

      if (!user.isActive || user.isLocked) {
        return next(new Error('Account activation required before chat access'));
      }

      socket.user = user;
      return next();
    } catch (error) {
      return next(new Error('Not authorized, token invalid'));
    }
  });

  io.on('connection', async (socket) => {
    try {
      await joinUserChatRooms(socket);
    } catch (_error) {
      socket.emit('chat:sync:error', { message: 'Unable to join chat rooms' });
    }

    socket.on('threads:join-all', async (ack) => {
      try {
        const roomCount = await joinUserChatRooms(socket);
        if (typeof ack === 'function') {
          ack({ ok: true, roomCount });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message || 'Unable to join chat rooms' });
        }
      }
    });

    socket.on('room:join', async (roomId, ack) => {
      if (!roomId) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: 'roomId is required' });
        }
        return;
      }

      try {
        await assertThreadAccess(roomId, socket.user._id);
        socket.join(roomId);
        if (typeof ack === 'function') {
          ack({ ok: true, roomId });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message || 'Unable to join room' });
        }
      }
    });

    socket.on('chat:message:send', async (payload, ack) => {
      try {
        const result = await sendMessage({
          threadId: payload?.threadId,
          senderId: socket.user._id,
          text: payload?.encryptedPayload,
          replyToMessageId: payload?.replyToMessageId || null,
          clientMessageId: payload?.clientMessageId || null,
          deleteAfterReadSeconds: payload?.deleteAfterReadSeconds ?? null,
          logContext: {
            ipAddress: socket.handshake.address || null,
            userAgent: socket.handshake.headers?.['user-agent'] || null,
          },
        });

        socket.join(result.threadId);

        io.to(result.threadId).emit('chat:message:new', {
          threadId: result.threadId,
          message: result.payload,
        });

        if (typeof ack === 'function') {
          ack({ ok: true, message: result.payload });
        }
      } catch (error) {
        if (typeof ack === 'function') {
          ack({ ok: false, message: error.message || 'Unable to send message' });
        }
      }
    });
  });
}

module.exports = registerSocketHandlers;
