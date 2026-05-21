const express = require('express');

const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const {
  getOrCreateDirectThread,
  createGroupThread,
  listThreadsForUser,
  listMessagesForThread,
  sendMessage,
  markMessageRead,
  assertThreadAccess,
  getEncryptedThreadKeyForUser,
  searchCustomerByEmail,
  listIncomingRequests,
  listOutgoingRequests,
  createChatRequest,
  acceptChatRequest,
  rejectChatRequest,
} = require('../services/chatService');

const router = express.Router();

function withStatus(res, error) {
  if (error && error.statusCode) {
    res.status(error.statusCode);
  }
}

function getLogContext(req) {
  return {
    ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || req.ip || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

router.use(protect);

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user._id },
      isActive: true,
      isLocked: false,
      role: 'customer',
    })
      .select('username email role publicKey keyExchangePublicKey')
      .sort({ username: 1 })
      .lean();

    res.json({ users });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.get('/users/search', async (req, res, next) => {
  try {
    const user = await searchCustomerByEmail(req.query.email, req.user._id);
    res.json({ user });
  } catch (error) {
    if (error?.statusCode === 404) {
      return res.status(200).json({ user: null, message: error.message });
    }
    withStatus(res, error);
    next(error);
  }
});

router.get('/requests/incoming', async (req, res, next) => {
  try {
    const requests = await listIncomingRequests(req.user._id);
    res.json({ requests });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.get('/requests/outgoing', async (req, res, next) => {
  try {
    const requests = await listOutgoingRequests(req.user._id);
    res.json({ requests });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/requests', async (req, res, next) => {
  try {
    const { recipientEmail, encryptedPayload, participantKeys } = req.body;
    const request = await createChatRequest({
      requesterId: req.user._id,
      recipientEmail,
      encryptedPayload,
      participantKeys,
    });

    res.status(201).json({ request });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/requests/:requestId/accept', async (req, res, next) => {
  try {
    const result = await acceptChatRequest({
      requestId: req.params.requestId,
      recipientId: req.user._id,
      logContext: getLogContext(req),
    });

    req.app.get('io')?.to(String(result.threadId)).emit('chat:message:new', {
      threadId: String(result.threadId),
      message: result.initialMessage,
    });

    res.status(200).json(result);
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/requests/:requestId/reject', async (req, res, next) => {
  try {
    const result = await rejectChatRequest({
      requestId: req.params.requestId,
      recipientId: req.user._id,
    });

    res.status(200).json(result);
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.put('/keys/public', async (req, res, next) => {
  try {
    const publicKey = String(req.body?.publicKey || '').trim();
    const keyExchangePublicKey = String(req.body?.keyExchangePublicKey || '').trim();
    if (!publicKey) {
      res.status(400);
      throw new Error('publicKey is required');
    }

    if (!keyExchangePublicKey) {
      res.status(400);
      throw new Error('keyExchangePublicKey is required');
    }

    req.user.publicKey = publicKey;
    req.user.keyExchangePublicKey = keyExchangePublicKey;
    await req.user.save();

    res.json({ ok: true });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.get('/threads', async (req, res, next) => {
  try {
    const threads = await listThreadsForUser(req.user._id);
    res.json({ threads });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/threads/direct', async (req, res, next) => {
  try {
    const { participantId, participantKeys } = req.body;
    const thread = await getOrCreateDirectThread(req.user._id, participantId, participantKeys);
    res.status(201).json({
      thread: {
        id: thread._id,
        threadType: thread.threadType,
        participantIds: thread.participantIds,
        lastActivityAt: thread.lastActivityAt,
      },
    });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/threads/group', async (req, res, next) => {
  try {
    const { participantIds, participantKeys, name } = req.body;
    const thread = await createGroupThread({
      creatorId: req.user._id,
      participantIds,
      participantKeys,
      name,
    });

    res.status(201).json({
      thread: {
        id: thread._id,
        threadType: thread.threadType,
        name: thread.name || null,
        participantIds: thread.participantIds,
        lastActivityAt: thread.lastActivityAt,
      },
    });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.get('/threads/:threadId/key', async (req, res, next) => {
  try {
    const encryptedKey = await getEncryptedThreadKeyForUser(req.params.threadId, req.user._id);
    res.json({ encryptedKey });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.get('/threads/:threadId/messages', async (req, res, next) => {
  try {
    const messages = await listMessagesForThread({
      threadId: req.params.threadId,
      userId: req.user._id,
      limit: req.query.limit,
    });

    res.json({ messages });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/threads/:threadId/messages', async (req, res, next) => {
  try {
    const { encryptedPayload, replyToMessageId, clientMessageId, deleteAfterReadSeconds } = req.body;

    const result = await sendMessage({
      threadId: req.params.threadId,
      senderId: req.user._id,
      text: encryptedPayload,
      replyToMessageId,
      clientMessageId,
      deleteAfterReadSeconds,
      logContext: getLogContext(req),
    });

    req.app.get('io')?.to(result.threadId).emit('chat:message:new', {
      threadId: result.threadId,
      message: result.payload,
    });

    res.status(201).json({ message: result.payload });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/threads/:threadId/messages/:messageId/read', async (req, res, next) => {
  try {
    const result = await markMessageRead({
      threadId: req.params.threadId,
      messageId: req.params.messageId,
      userId: req.user._id,
    });

    res.status(200).json(result);
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/threads/:threadId/join', async (req, res, next) => {
  try {
    await assertThreadAccess(req.params.threadId, req.user._id);
    res.status(200).json({ ok: true });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

module.exports = router;
