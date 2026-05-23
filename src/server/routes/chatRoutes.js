const express = require('express');

const User = require('../models/User');
const { sendEmail } = require('../services/emailOtpService')
const { protect } = require('../middleware/authMiddleware');
const {
  getOrCreateDirectThread,
  createGroupThread,
  updateGroupThread,
  inviteGroupMembers,
  listGroupInvitations,
  acceptGroupInvitation,
  declineGroupInvitation,
  listThreadsForUser,
  listMessagesForThread,
  sendMessage,
  markMessageRead,
  deleteMessage,
  assertThreadAccess,
  getEncryptedThreadKeyForUser,
  searchCustomerByEmail,
  listIncomingRequests,
  listOutgoingRequests,
  getNotificationSummary,
  markThreadMessagesRead,
  listAcceptedFriends,
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

function emitMessageToParticipants(io, result) {
  (result.participantIds || []).forEach((participantId) => {
    io?.to(`user:${participantId}`).emit('chat:message:new', {
      threadId: result.threadId,
      message: result.payload,
    });
  });
}

function emitGroupInvitations(io, { invitedUserIds = [], threadId, groupName, inviter, invitedAt = new Date() }) {
  const uniqueInvitees = Array.from(new Set(invitedUserIds.map((id) => String(id)).filter(Boolean)));
  uniqueInvitees.forEach((userId) => {
    io?.to(`user:${userId}`).emit('group:invitation:new', {
      threadId: String(threadId),
      group: {
        id: String(threadId),
        name: groupName || null,
      },
      invitedBy: {
        id: String(inviter?._id || inviter?.id || ''),
        username: inviter?.username || 'A customer',
        email: inviter?.email || null,
      },
      invitedAt,
    });
  });
}

function emitNotificationChanged(io, userId, payload = {}) {
  if (!userId) return;
  io?.to(`user:${String(userId)}`).emit('notifications:changed', {
    changedAt: new Date().toISOString(),
    ...payload,
  });
}

router.use(protect);

router.get('/notifications', async (req, res, next) => {
  try {
    const summary = await getNotificationSummary(req.user._id);
    res.json(summary);
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.get('/notifications/unread-count', async (req, res, next) => {
  try {
    const summary = await getNotificationSummary(req.user._id);
    res.json({ unreadCount: summary.unreadCount });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/notifications/read', async (req, res, next) => {
  try {
    const type = String(req.body?.type || '');
    if (type !== 'message') {
      res.status(400);
      throw new Error('Only message notifications can be marked as read directly');
    }

    const result = await markThreadMessagesRead({
      threadId: req.body?.threadId,
      userId: req.user._id,
    });

    emitNotificationChanged(req.app.get('io'), req.user._id, {
      reason: 'message-read',
      threadId: result.threadId,
    });

    res.status(200).json(result);
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.get('/friends', async (req, res, next) => {
  try {
    const friends = await listAcceptedFriends(req.user._id);
    res.json({ friends });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

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

    req.app.get('io')?.to(`user:${String(request.recipient?.id || '')}`).emit('chat:request:new', {
      request,
      requester: {
        id: String(req.user._id),
        username: req.user.username,
        email: req.user.email,
      },
      createdAt: request.createdAt,
    });
    emitNotificationChanged(req.app.get('io'), request.recipient?.id, { reason: 'chat-request' });

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

    const io = req.app.get('io');
    const threadId = String(result.threadId);
    (result.participantIds || []).forEach((participantId) => {
      io?.in(`user:${participantId}`).socketsJoin(threadId);
    });

    (result.participantIds || []).forEach((participantId) => {
      io?.to(`user:${participantId}`).emit('chat:message:new', {
        threadId,
        message: result.initialMessage,
      });
      emitNotificationChanged(io, participantId, { reason: 'message', threadId });
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

    emitNotificationChanged(req.app.get('io'), req.user._id, { reason: 'chat-request' });

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

router.get('/groups/invitations', async (req, res, next) => {
  try {
    const invitations = await listGroupInvitations(req.user._id);
    res.json({ invitations });
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/groups/invitations/:invitationId/accept', async (req, res, next) => {
  try {
    const result = await acceptGroupInvitation({
      invitationId: req.params.invitationId,
      userId: req.user._id,
    });

    const threadId = String(result.threadId);
    const userId = String(req.user._id);
    req.app.get('io')?.in(`user:${userId}`).socketsJoin(threadId);
    req.app.get('io')?.to(`user:${userId}`).emit('group:invitation:accepted', {
      threadId,
      invitationId: String(result.invitationId),
      joinedAt: result.joinedAt,
    });
    emitNotificationChanged(req.app.get('io'), userId, { reason: 'group-invitation', threadId });

    res.status(200).json(result);
  } catch (error) {
    withStatus(res, error);
    next(error);
  }
});

router.post('/groups/invitations/:invitationId/decline', async (req, res, next) => {
  try {
    const result = await declineGroupInvitation({
      invitationId: req.params.invitationId,
      userId: req.user._id,
    });

    emitNotificationChanged(req.app.get('io'), req.user._id, { reason: 'group-invitation' });

    res.status(200).json(result);
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
    const invitedUserIds = Array.from(
      new Set((participantIds || []).map((id) => String(id)).filter((id) => id && id !== String(req.user._id))),
    );

    emitGroupInvitations(req.app.get('io'), {
      invitedUserIds,
      threadId: thread._id,
      groupName: thread.name,
      inviter: req.user,
      invitedAt: thread.createdAt || new Date(),
    });
    invitedUserIds.forEach((userId) => {
      emitNotificationChanged(req.app.get('io'), userId, {
        reason: 'group-invitation',
        threadId: String(thread._id),
      });
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

router.put('/threads/:threadId/group', async (req, res, next) => {
  try {
    const thread = await updateGroupThread({
      threadId: req.params.threadId,
      userId: req.user._id,
      name: req.body?.name,
    });

    res.json({
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

router.post('/threads/:threadId/group/invitations', async (req, res, next) => {
  try {
    const result = await inviteGroupMembers({
      threadId: req.params.threadId,
      inviterId: req.user._id,
      participantIds: req.body?.participantIds,
      participantKeys: req.body?.participantKeys,
    });
    if (Array.isArray(result.invitedUsers) && result.invitedUsers.length > 0) {
  await Promise.all(
    result.invitedUsers
      .filter((user) => user.email)
      .map(async (user) => {
        try {
          await sendEmail(
            user.email,
            'New group invitation on Shadow Link',
            `${req.user?.username || 'Someone'} invited you to join ${result.groupName || 'a group'} on Shadow Link. Open the app to accept or decline.`
          )
        } catch (emailError) {
          console.error('Group invitation email failed:', emailError.message)
        }
      })
  )
}

    emitGroupInvitations(req.app.get('io'), {
      invitedUserIds: result.invitedUserIds || [],
      threadId: result.threadId,
      groupName: result.groupName || null,
      inviter: req.user,
    });
    (result.invitedUserIds || []).forEach((userId) => {
      emitNotificationChanged(req.app.get('io'), userId, {
        reason: 'group-invitation',
        threadId: String(result.threadId),
      });
    });

    res.status(201).json(result);
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

    emitMessageToParticipants(req.app.get('io'), result);
    (result.participantIds || []).forEach((participantId) => {
      emitNotificationChanged(req.app.get('io'), participantId, {
        reason: 'message',
        threadId: result.threadId,
      });
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

router.delete('/threads/:threadId/messages/:messageId', async (req, res, next) => {
  try {
    const deleteFor = String(req.body?.deleteFor || '');
    if (deleteFor !== 'me' && deleteFor !== 'everyone') {
      res.status(400);
      return next(new Error('deleteFor must be "me" or "everyone"'));
    }

    const result = await deleteMessage({
      messageId: req.params.messageId,
      threadId: req.params.threadId,
      userId: req.user._id,
      deleteFor,
    });

    if (deleteFor === 'everyone') {
      const io = req.app.get('io');
      (result.participantIds || []).forEach((participantId) => {
        io?.to(`user:${participantId}`).emit('chat:message:deleted', {
          messageId: result.messageId,
        });
      });
    }

    res.json({ ok: true, ...result });
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
