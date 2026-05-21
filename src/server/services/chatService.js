const crypto = require('crypto');
const mongoose = require('mongoose');

const ChatThread = require('../models/ChatThread');
const ChatRequest = require('../models/ChatRequest');
const GroupMember = require('../models/GroupMember');
const User = require('../models/User');
const Message = require('../models/Message');
const EphemeralMessageLog = require('../models/EphemeralMessageLog');
const MessageIntegrityLog = require('../models/MessageIntegrityLog');
const Logger = require('./logger');

function toObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

function isSameId(a, b) {
  if (!a || !b) return false;
  return String(a) === String(b);
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateEncryptedPayload(encryptedPayload) {
  if (!encryptedPayload || typeof encryptedPayload !== 'object') {
    const error = new Error('Encrypted payload is required');
    error.statusCode = 400;
    throw error;
  }

  const ciphertext = String(encryptedPayload.ciphertext || '');
  const iv = String(encryptedPayload.iv || '');
  const authTag = String(encryptedPayload.authTag || '');
  const algorithm = String(encryptedPayload.algorithm || 'aes-256-gcm').toLowerCase();

  if (!ciphertext || !iv || !authTag) {
    const error = new Error('ciphertext, iv, and authTag are required');
    error.statusCode = 400;
    throw error;
  }

  if (ciphertext.length > 20000 || iv.length > 500 || authTag.length > 500) {
    const error = new Error('Encrypted message payload exceeds limits');
    error.statusCode = 400;
    throw error;
  }

  if (algorithm !== 'aes-256-gcm' && algorithm !== 'aes-gcm') {
    const error = new Error('Unsupported encryption algorithm');
    error.statusCode = 400;
    throw error;
  }

  return {
    ciphertext,
    iv,
    authTag,
    algorithm: 'aes-256-gcm',
  };
}

function computeIntegrityHash(payload) {
  const joined = [
    String(payload?.ciphertext || ''),
    String(payload?.iv || ''),
    String(payload?.authTag || ''),
    String(payload?.algorithm || ''),
  ].join('|');

  return crypto.createHash('sha256').update(joined).digest('hex');
}

function normalizeDeleteAfterReadSeconds(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 5 || parsed > 86400) {
    const error = new Error('deleteAfterReadSeconds must be between 5 and 86400');
    error.statusCode = 400;
    throw error;
  }

  return Math.floor(parsed);
}

function normalizeParticipantKeys(participantKeys, participantIds) {
  if (!Array.isArray(participantKeys) || participantKeys.length === 0) {
    const error = new Error('participantKeys are required for end-to-end encryption');
    error.statusCode = 400;
    throw error;
  }

  const normalized = participantKeys.map((item) => ({
    userId: String(item.userId || ''),
    encryptedKey: String(item.encryptedKey || ''),
  }));

  const expected = new Set(participantIds.map((id) => String(id)));
  const provided = new Set(normalized.map((item) => item.userId));

  for (const id of expected) {
    if (!provided.has(id)) {
      const error = new Error('Missing encrypted thread key for one or more participants');
      error.statusCode = 400;
      throw error;
    }
  }

  normalized.forEach((item) => {
    if (!item.encryptedKey || item.encryptedKey.length < 20) {
      const error = new Error('Invalid encrypted thread key payload');
      error.statusCode = 400;
      throw error;
    }
  });

  return normalized;
}

async function assertThreadAccess(threadId, userId) {
  const thread = await ChatThread.findById(threadId);

  if (!thread) {
    throw createError('Chat thread not found', 404);
  }

  if (thread.status === 'archived') {
    throw createError('Chat thread not found', 404);
  }

  const isParticipant = (thread.participantIds || []).some((id) => isSameId(id, userId));

  if (thread.threadType !== 'group') {
    if (!isParticipant) {
      throw createError('You are not a participant in this thread', 403);
    }

    return thread;
  }

  let membership = await GroupMember.findOne({ groupId: thread._id, userId });

  if (!membership && isParticipant) {
    const joinedAt = thread.createdAt || new Date();
    membership = await GroupMember.findOneAndUpdate(
      { groupId: thread._id, userId },
      {
        $setOnInsert: {
          groupId: thread._id,
          userId,
          status: 'accepted',
          invitedBy: thread.createdBy || userId,
          invitedAt: joinedAt,
          acceptedAt: joinedAt,
          joinedAt,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
  }

  if (!membership || membership.status !== 'accepted' || !membership.joinedAt || !isParticipant) {
    throw createError('You must accept the group invitation before accessing this group', 403);
  }

  thread.$locals = thread.$locals || {};
  thread.$locals.accessMembership = membership;
  thread.accessMembership = membership;
  return thread;
}

function buildVisibleMessageQuery(thread, userId, extra = {}) {
  const query = {
    ...extra,
    threadId: thread._id,
  };

  if (thread.threadType === 'group') {
    const joinedAt = thread.accessMembership?.joinedAt || thread.$locals?.accessMembership?.joinedAt;
    if (!joinedAt) {
      throw createError('Accepted group membership is required to read messages', 403);
    }
    query.createdAt = {
      ...(query.createdAt || {}),
      $gte: joinedAt,
    };
  }

  return query;
}

function mapGroupInvitation(invitation) {
  const group = invitation.groupId || {};
  const inviter = invitation.invitedBy || {};

  return {
    id: invitation._id,
    groupId: group._id || invitation.groupId,
    group: {
      id: group._id || invitation.groupId,
      name: group.name || null,
      threadType: group.threadType || 'group',
      createdAt: group.createdAt || null,
    },
    invitedBy: {
      id: inviter._id || invitation.invitedBy,
      username: inviter.username || 'Unknown',
      email: inviter.email || null,
    },
    status: invitation.status,
    invitedAt: invitation.invitedAt,
  };
}

async function listAcceptedGroupMemberIds(threadOrId) {
  const groupId = threadOrId?._id || threadOrId;
  const memberships = await GroupMember.find({ groupId })
    .select('userId status joinedAt')
    .lean();

  const membershipByUser = new Map(memberships.map((membership) => [String(membership.userId), membership]));
  const accepted = memberships
    .filter((membership) => membership.status === 'accepted' && membership.joinedAt)
    .map((membership) => String(membership.userId));

  const legacyAccepted = (threadOrId?.participantIds || [])
    .map((id) => String(id))
    .filter((id) => !membershipByUser.has(id));

  return Array.from(new Set([...accepted, ...legacyAccepted]));
}

function mapMessage(message, currentUserId, replyMap = new Map()) {
  const reply = replyMap.get(String(message.replyTo?._id || message.replyTo)) || null;

  return {
    id: message._id,
    threadId: message.threadId,
    senderId: message.sender?._id || message.sender,
    senderName: message.sender?.username || 'Unknown',
    receiverId: message.receiver || null,
    encryptedPayload: {
      ciphertext: message.ciphertext,
      iv: message.iv,
      authTag: message.authTag,
      algorithm: message.algorithm || 'aes-256-gcm',
    },
    isOwn: isSameId(message.sender?._id || message.sender, currentUserId),
    createdAt: message.createdAt,
    readAt: message.readAt,
    expiresAt: message.expiresAt,
    deleteAfterReadSeconds: message.deleteAfterReadSeconds || null,
    replyTo: reply
      ? {
          id: reply._id,
          senderId: reply.sender?._id || reply.sender,
          senderName: reply.sender?.username || 'Unknown',
        }
      : null,
  };
}

async function verifyMessageIntegrity(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;

  await Promise.all(
    messages.map(async (message) => {
      const expected = computeIntegrityHash({
        ciphertext: message.ciphertext,
        iv: message.iv,
        authTag: message.authTag,
        algorithm: message.algorithm,
      });

      const present = String(message.integrityHash || '');
      if (present && present === expected) {
        return;
      }

      try {
        await MessageIntegrityLog.create({
          messageId: String(message._id),
          threadId: String(message.threadId),
          senderId: message.sender?._id || message.sender,
          hashStatus: present ? 'mismatch' : 'missing',
          verificationResult: 'failed',
          actionTaken: 'message integrity verification failed during retrieval',
        });
      } catch (logError) {
        // Non-fatal: integrity log failure must not block message retrieval.
        console.error('MessageIntegrityLog.create failed:', logError.message);
      }
    }),
  );
}

async function deleteExpiredEphemeralMessages() {
  const now = new Date();
  const expired = await Message.find({
    expiresAt: { $lte: now },
    deleteAfterReadSeconds: { $ne: null },
  })
    .select('_id threadId sender expiresAt')
    .lean();

  if (expired.length === 0) {
    return { deletedCount: 0, messageIds: [] };
  }

  const deletedIds = [];
  const deletionEvents = [];

  for (const item of expired) {
    try {
      const deleted = await Message.deleteOne({ _id: item._id });
      if (deleted.deletedCount === 1) {
        deletedIds.push(String(item._id));
        const thread = await ChatThread.findById(item.threadId)
          .select('threadType participantIds')
          .lean();
        const participantIds = thread?.threadType === 'group'
          ? await listAcceptedGroupMemberIds(thread)
          : (thread?.participantIds || []).map((id) => String(id));
        deletionEvents.push({
          messageId: String(item._id),
          threadId: String(item.threadId),
          participantIds,
        });
        await EphemeralMessageLog.findOneAndUpdate(
          { messageId: String(item._id) },
          {
            $set: {
              threadId: String(item.threadId),
              senderId: item.sender,
              expiryAt: item.expiresAt,
              deletionStatus: 'deleted',
              deletedAt: now,
            },
          },
          { upsert: true, returnDocument: 'after' },
        );
      }
    } catch (_error) {
      await EphemeralMessageLog.findOneAndUpdate(
        { messageId: String(item._id) },
        {
          $set: {
            threadId: String(item.threadId),
            senderId: item.sender,
            expiryAt: item.expiresAt,
            deletionStatus: 'failed',
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
    }
  }

  return {
    deletedCount: deletedIds.length,
    messageIds: deletedIds,
    deletionEvents,
  };
}

async function getOrCreateDirectThread(userId, participantId, participantKeys = []) {
  if (!participantId || isSameId(userId, participantId)) {
    const error = new Error('A different participant is required');
    error.statusCode = 400;
    throw error;
  }

  const userA = toObjectId(userId);
  const userB = toObjectId(participantId);

  let thread = await ChatThread.findOne({
    threadType: 'direct',
    participantIds: { $all: [userA, userB], $size: 2 },
  });

  const normalizedParticipantKeys = normalizeParticipantKeys(participantKeys, [userA, userB]);

  if (!thread) {
    thread = await ChatThread.create({
      threadType: 'direct',
      participantIds: [userA, userB],
      createdBy: userA,
      status: 'active',
      metadataOnly: false,
      encryptedKeys: normalizedParticipantKeys,
      lastActivityAt: new Date(),
      messageCount: 0,
    });
  } else {
    const keyByUser = new Map(
      (thread.encryptedKeys || []).map((item) => [String(item.userId), item.encryptedKey]),
    );

    normalizedParticipantKeys.forEach((item) => {
      keyByUser.set(String(item.userId), item.encryptedKey);
    });

    thread.encryptedKeys = Array.from(keyByUser.entries()).map(([id, encryptedKey]) => ({
      userId: id,
      encryptedKey,
    }));
    await thread.save();
  }

  return thread;
}

async function createGroupThread({ creatorId, participantIds = [], participantKeys = [], name = '' }) {
  const creator = String(creatorId);
  const invitedIds = Array.from(
    new Set(participantIds.map((id) => String(id)).filter((id) => id && id !== creator)),
  );
  const normalizedIds = [creator, ...invitedIds];

  if (normalizedIds.length < 3) {
    throw createError('A group chat requires the creator plus at least two invited users', 400);
  }

  const users = await User.find({
    _id: { $in: normalizedIds },
    isActive: true,
    isLocked: false,
  })
    .select('_id')
    .lean();

  if (users.length !== normalizedIds.length) {
    const error = new Error('One or more participants are invalid or inactive');
    error.statusCode = 400;
    throw error;
  }

  const normalizedParticipantKeys = normalizeParticipantKeys(participantKeys, normalizedIds);
  const now = new Date();

  const thread = await ChatThread.create({
    threadType: 'group',
    name: String(name || '').trim() || null,
    participantIds: [toObjectId(creator)],
    createdBy: toObjectId(creatorId),
    status: 'active',
    metadataOnly: false,
    encryptedKeys: normalizedParticipantKeys,
    lastActivityAt: now,
    messageCount: 0,
  });

  await GroupMember.create([
    {
      groupId: thread._id,
      userId: toObjectId(creator),
      status: 'accepted',
      invitedBy: toObjectId(creator),
      invitedAt: now,
      acceptedAt: now,
      joinedAt: now,
    },
    ...invitedIds.map((id) => ({
      groupId: thread._id,
      userId: toObjectId(id),
      status: 'pending',
      invitedBy: toObjectId(creator),
      invitedAt: now,
      acceptedAt: null,
      joinedAt: null,
      declinedAt: null,
      removedAt: null,
    })),
  ]);

  return thread;
}

async function updateGroupThread({ threadId, userId, name = '' }) {
  const thread = await assertThreadAccess(threadId, userId);

  if (thread.threadType !== 'group') {
    throw createError('Group chat not found', 404);
  }

  thread.name = String(name || '').trim() || null;
  await thread.save();

  return thread;
}

async function inviteGroupMembers({ threadId, inviterId, participantIds = [], participantKeys = [] }) {
  const thread = await assertThreadAccess(threadId, inviterId);

  if (thread.threadType !== 'group') {
    throw createError('Group chat not found', 404);
  }

  const inviteeIds = Array.from(
    new Set(participantIds.map((id) => String(id)).filter((id) => id && id !== String(inviterId))),
  );

  if (inviteeIds.length === 0) {
    throw createError('At least one invitee is required', 400);
  }

  const activeUsers = await User.find({
    _id: { $in: inviteeIds },
    isActive: true,
    isLocked: false,
  })
    .select('_id')
    .lean();

  if (activeUsers.length !== inviteeIds.length) {
    throw createError('One or more invitees are invalid or inactive', 400);
  }

  const acceptedMemberIds = await listAcceptedGroupMemberIds(thread);
  const newInviteeIds = inviteeIds.filter((id) => !acceptedMemberIds.includes(id));

  if (newInviteeIds.length === 0) {
    throw createError('Selected users are already group members', 409);
  }

  const keysForInvitees = normalizeParticipantKeys(participantKeys, newInviteeIds);
  const keyByUser = new Map((thread.encryptedKeys || []).map((item) => [String(item.userId), item.encryptedKey]));
  keysForInvitees.forEach((item) => {
    keyByUser.set(String(item.userId), item.encryptedKey);
  });
  thread.encryptedKeys = Array.from(keyByUser.entries()).map(([id, encryptedKey]) => ({
    userId: id,
    encryptedKey,
  }));
  await thread.save();

  const now = new Date();
  await Promise.all(
    newInviteeIds.map((id) => GroupMember.findOneAndUpdate(
      { groupId: thread._id, userId: id },
      {
        $set: {
          status: 'pending',
          invitedBy: inviterId,
          invitedAt: now,
          acceptedAt: null,
          joinedAt: null,
          declinedAt: null,
          removedAt: null,
        },
        $setOnInsert: {
          groupId: thread._id,
          userId: id,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    )),
  );

  return { threadId: String(thread._id), groupName: thread.name || null, invitedUserIds: newInviteeIds };
}

async function listGroupInvitations(userId) {
  const invitations = await GroupMember.find({ userId, status: 'pending' })
    .sort({ invitedAt: -1 })
    .populate('groupId', 'name threadType createdAt status')
    .populate('invitedBy', 'username email')
    .lean();

  return invitations
    .filter((invitation) => invitation.groupId && invitation.groupId.status !== 'archived')
    .map(mapGroupInvitation);
}

async function acceptGroupInvitation({ invitationId, userId }) {
  const invitation = await GroupMember.findById(invitationId);

  if (!invitation || invitation.status !== 'pending') {
    throw createError('Group invitation not found or no longer pending', 404);
  }

  if (!isSameId(invitation.userId, userId)) {
    throw createError('You are not allowed to accept this group invitation', 403);
  }

  const thread = await ChatThread.findById(invitation.groupId);
  if (!thread || thread.threadType !== 'group' || thread.status === 'archived') {
    throw createError('Group chat not found', 404);
  }

  const now = new Date();
  invitation.status = 'accepted';
  invitation.acceptedAt = now;
  invitation.joinedAt = now;
  invitation.declinedAt = null;
  invitation.removedAt = null;
  await invitation.save();

  await ChatThread.findByIdAndUpdate(thread._id, {
    $addToSet: { participantIds: toObjectId(userId) },
    $set: { lastActivityAt: thread.lastActivityAt || now },
  });

  return {
    invitationId: invitation._id,
    threadId: thread._id,
    joinedAt: invitation.joinedAt,
  };
}

async function declineGroupInvitation({ invitationId, userId }) {
  const invitation = await GroupMember.findById(invitationId);

  if (!invitation || invitation.status !== 'pending') {
    throw createError('Group invitation not found or no longer pending', 404);
  }

  if (!isSameId(invitation.userId, userId)) {
    throw createError('You are not allowed to decline this group invitation', 403);
  }

  invitation.status = 'declined';
  invitation.declinedAt = new Date();
  invitation.acceptedAt = null;
  invitation.joinedAt = null;
  await invitation.save();

  return { ok: true, invitationId: invitation._id };
}

async function listThreadsForUser(userId) {
  const threads = await ChatThread.find({ participantIds: userId, status: { $ne: 'archived' } })
    .sort({ lastActivityAt: -1 })
    .populate('participantIds', 'username email role isActive publicKey keyExchangePublicKey')
    .lean();

  const groupIds = threads
    .filter((thread) => thread.threadType === 'group')
    .map((thread) => thread._id);
  const memberships = groupIds.length > 0
    ? await GroupMember.find({ groupId: { $in: groupIds }, userId, status: 'accepted' }).lean()
    : [];
  const membershipByGroup = new Map(memberships.map((membership) => [String(membership.groupId), membership]));

  const enriched = await Promise.all(
    threads.map(async (thread) => {
      const membership = membershipByGroup.get(String(thread._id));
      const lastMessageQuery = { threadId: thread._id };
      if (thread.threadType === 'group' && membership?.joinedAt) {
        lastMessageQuery.createdAt = { $gte: membership.joinedAt };
      }

      const [lastMessage, visibleMessageCount] = await Promise.all([
        Message.findOne(lastMessageQuery)
          .sort({ createdAt: -1 })
          .populate('sender', 'username')
          .lean(),
        thread.threadType === 'group' && membership?.joinedAt
          ? Message.countDocuments(lastMessageQuery)
          : Promise.resolve(thread.messageCount),
      ]);

      const visibleLastActivityAt = thread.threadType === 'group' && membership?.joinedAt
        ? (lastMessage?.createdAt || membership.joinedAt)
        : thread.lastActivityAt;

      return {
        id: thread._id,
        threadType: thread.threadType,
        name: thread.name || null,
        createdBy: thread.createdBy ? String(thread.createdBy) : null,
        participants: (thread.participantIds || []).map((participant) => ({
          id: participant._id,
          username: participant.username,
          email: participant.email,
          role: participant.role,
          isActive: participant.isActive,
          publicKey: participant.publicKey || null,
          keyExchangePublicKey: participant.keyExchangePublicKey || null,
        })),
        lastActivityAt: visibleLastActivityAt,
        messageCount: visibleMessageCount,
        lastMessage: lastMessage
          ? {
              id: lastMessage._id,
              senderName: lastMessage.sender?.username || 'Unknown',
              text: '',
              encryptedPayload: {
                ciphertext: lastMessage.ciphertext,
                iv: lastMessage.iv,
                authTag: lastMessage.authTag,
                algorithm: lastMessage.algorithm || 'aes-256-gcm',
              },
              createdAt: lastMessage.createdAt,
            }
          : null,
      };
    }),
  );

  return enriched;
}

async function listMessagesForThread({ threadId, userId, limit = 50 }) {
  await deleteExpiredEphemeralMessages();

  const thread = await assertThreadAccess(threadId, userId);
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));

  const userObjectId = toObjectId(userId);
  const messages = await Message.find(buildVisibleMessageQuery(thread, userId, {
    deletedForEveryone: { $ne: true },
    deletedFor: { $not: { $elemMatch: { $eq: userObjectId } } },
  }))
    .sort({ createdAt: -1 })
    .limit(boundedLimit)
    .populate('sender', 'username')
    .populate({ path: 'replyTo', populate: { path: 'sender', select: 'username' } });

  const ordered = [...messages].reverse();
  await verifyMessageIntegrity(ordered);
  const replyMap = new Map();

  ordered.forEach((message) => {
    if (message.replyTo) {
      replyMap.set(String(message.replyTo._id), message.replyTo);
    }
  });

  return ordered.map((message) => mapMessage(message, userId, replyMap));
}

async function sendMessage({
  threadId,
  senderId,
  text,
  replyToMessageId = null,
  clientMessageId = null,
  deleteAfterReadSeconds = null,
  logContext = {},
}) {
  const normalizedEncryptedPayload = validateEncryptedPayload(text);
  const normalizedDeleteAfterReadSeconds = normalizeDeleteAfterReadSeconds(deleteAfterReadSeconds);
  const thread = await assertThreadAccess(threadId, senderId);

  let replyTo = null;
  if (replyToMessageId) {
    replyTo = await Message.findOne(buildVisibleMessageQuery(thread, senderId, { _id: replyToMessageId }))
      .populate('sender', 'username');

    if (!replyTo) {
      const error = new Error('Reply target message not found');
      error.statusCode = 404;
      throw error;
    }

    // Limit to one-level reply threads for readability and abuse resistance.
    if (replyTo.replyTo) {
      const error = new Error('Nested replies are not allowed');
      error.statusCode = 400;
      throw error;
    }
  }

  const participants = thread.threadType === 'group'
    ? await listAcceptedGroupMemberIds(thread)
    : (thread.participantIds || []).map((id) => String(id));
  const receiverId = thread.threadType === 'direct'
    ? participants.find((id) => id !== String(senderId)) || null
    : null;

  const message = await Message.create({
    sender: senderId,
    receiver: receiverId,
    roomId: String(thread._id),
    threadId: thread._id,
    ciphertext: normalizedEncryptedPayload.ciphertext,
    iv: normalizedEncryptedPayload.iv,
    authTag: normalizedEncryptedPayload.authTag,
    algorithm: normalizedEncryptedPayload.algorithm,
    integrityHash: computeIntegrityHash(normalizedEncryptedPayload),
    replyTo: replyTo ? replyTo._id : null,
    deleteAfterReadSeconds: normalizedDeleteAfterReadSeconds,
  });

  await ChatThread.findByIdAndUpdate(thread._id, {
    $inc: { messageCount: 1 },
    $set: { lastActivityAt: new Date(), metadataOnly: false },
  });

  await MessageIntegrityLog.create({
    messageId: String(message._id),
    threadId: String(thread._id),
    senderId,
    hashStatus: 'present',
    verificationResult: 'valid',
    actionTaken: 'encrypted message stored',
  });

  await Logger.logEncryption(
    senderId,
    'messageEncryptedAndStored',
    true,
    'Encrypted message payload persisted without server-side decryption',
    'AES-256-GCM',
  );

  await Logger.logMessageSecurity(
    senderId,
    message._id,
    String(thread._id),
    'messageSent',
    true,
    'Encrypted message sent to chat thread',
  );

  const populated = await Message.findById(message._id)
    .populate('sender', 'username')
    .populate({ path: 'replyTo', populate: { path: 'sender', select: 'username' } });

  const replyMap = new Map();
  if (populated.replyTo) {
    replyMap.set(String(populated.replyTo._id), populated.replyTo);
  }

  return {
    threadId: String(thread._id),
    payload: {
      ...mapMessage(populated, senderId, replyMap),
      clientMessageId: clientMessageId ? String(clientMessageId) : null,
    },
    participantIds: participants,
    receiverId,
    logContext,
  };
}

async function markMessageRead({ threadId, messageId, userId }) {
  const thread = await assertThreadAccess(threadId, userId);

  const message = await Message.findOne(buildVisibleMessageQuery(thread, userId, { _id: messageId }));
  if (!message) {
    const error = new Error('Message not found');
    error.statusCode = 404;
    throw error;
  }

  if (isSameId(message.sender, userId)) {
    return { messageId: String(message._id), readAt: message.readAt, expiresAt: message.expiresAt };
  }

  if (!message.readAt) {
    message.readAt = new Date();
  }

  if (message.deleteAfterReadSeconds && !message.expiresAt) {
    message.expiresAt = new Date(message.readAt.getTime() + message.deleteAfterReadSeconds * 1000);

    await EphemeralMessageLog.findOneAndUpdate(
      { messageId: String(message._id) },
      {
        $set: {
          threadId: String(message.threadId),
          senderId: message.sender,
          expiryAt: message.expiresAt,
          deletionStatus: 'pending',
          deletedAt: null,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
  }

  await message.save();

  return {
    messageId: String(message._id),
    readAt: message.readAt,
    expiresAt: message.expiresAt,
  };
}

async function getEncryptedThreadKeyForUser(threadId, userId) {
  const thread = await assertThreadAccess(threadId, userId);
  const threadKey = (thread.encryptedKeys || []).find((item) => isSameId(item.userId, userId));

  if (!threadKey) {
    const error = new Error('No encrypted thread key found for current user');
    error.statusCode = 404;
    throw error;
  }

  return threadKey.encryptedKey;
}

async function searchCustomerByEmail(email, requesterId) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    const error = new Error('Email is required');
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({
    email: normalizedEmail,
    role: 'customer',
    isActive: true,
    isLocked: false,
    _id: { $ne: requesterId },
  })
    .select('username email role publicKey keyExchangePublicKey')
    .lean();

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    publicKey: user.publicKey,
    keyExchangePublicKey: user.keyExchangePublicKey || null,
  };
}

async function listAcceptedFriends(userId) {
  const requests = await ChatRequest.find({
    $or: [{ requesterId: userId }, { recipientId: userId }],
    status: 'accepted',
  })
    .populate('requesterId', 'username email publicKey keyExchangePublicKey')
    .populate('recipientId', 'username email publicKey keyExchangePublicKey')
    .lean();

  return requests
    .map((request) => {
      const isRequester = isSameId(
        request.requesterId?._id || request.requesterId,
        userId,
      );
      const contact = isRequester ? request.recipientId : request.requesterId;
      if (!contact) return null;
      return {
        id: String(contact._id),
        username: contact.username,
        email: contact.email,
        publicKey: contact.publicKey || null,
        keyExchangePublicKey: contact.keyExchangePublicKey || null,
      };
    })
    .filter(Boolean);
}

async function listIncomingRequests(userId) {
  const requests = await ChatRequest.find({ recipientId: userId, status: 'pending' })
    .sort({ createdAt: -1 })
    .populate('requesterId', 'username email publicKey keyExchangePublicKey')
    .lean();

  return requests.map((request) => ({
    id: request._id,
    requester: {
      id: request.requesterId?._id,
      username: request.requesterId?.username,
      email: request.requesterId?.email,
      publicKey: request.requesterId?.publicKey || null,
      keyExchangePublicKey: request.requesterId?.keyExchangePublicKey || null,
    },
    recipientId: request.recipientId,
    status: request.status,
    initialMessage: request.initialMessage,
    participantKeys: request.participantKeys || [],
    createdAt: request.createdAt,
  }));
}

async function listOutgoingRequests(userId) {
  const requests = await ChatRequest.find({ requesterId: userId })
    .sort({ updatedAt: -1 })
    .populate('recipientId', 'username email')
    .lean();

  return requests.map((request) => ({
    id: request._id,
    recipient: {
      id: request.recipientId?._id,
      username: request.recipientId?.username,
      email: request.recipientId?.email,
    },
    status: request.status,
    lockAfterRejection: request.lockAfterRejection,
    threadId: request.threadId,
    createdAt: request.createdAt,
    decidedAt: request.decidedAt,
  }));
}

async function createChatRequest({ requesterId, recipientEmail, encryptedPayload, participantKeys }) {
  const recipient = await searchCustomerByEmail(recipientEmail, requesterId);

  if (!recipient.publicKey) {
    const error = new Error('Recipient has no public encryption key yet');
    error.statusCode = 409;
    throw error;
  }

  const normalizedEncryptedPayload = validateEncryptedPayload(encryptedPayload);
  const normalizedParticipantKeys = normalizeParticipantKeys(participantKeys, [requesterId, recipient.id]);

  const existing = await ChatRequest.findOne({ requesterId, recipientId: recipient.id });

  if (existing) {
    if (existing.status === 'rejected' && existing.lockAfterRejection) {
      const error = new Error('Recipient rejected your first contact; you cannot message this user again');
      error.statusCode = 403;
      throw error;
    }

    if (existing.status === 'pending') {
      const error = new Error('A pending chat request already exists for this user');
      error.statusCode = 409;
      throw error;
    }

    if (existing.status === 'accepted') {
      const error = new Error('Chat already established with this user');
      error.statusCode = 409;
      throw error;
    }
  }

  const created = await ChatRequest.findOneAndUpdate(
    { requesterId, recipientId: recipient.id },
    {
      $set: {
        status: 'pending',
        lockAfterRejection: false,
        initialMessage: normalizedEncryptedPayload,
        participantKeys: normalizedParticipantKeys,
        threadId: null,
        decidedAt: null,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  return {
    id: created._id,
    recipient,
    status: created.status,
    createdAt: created.createdAt,
  };
}

async function acceptChatRequest({ requestId, recipientId, logContext = {} }) {
  const request = await ChatRequest.findById(requestId);

  if (!request || request.status !== 'pending') {
    const error = new Error('Chat request not found or no longer pending');
    error.statusCode = 404;
    throw error;
  }

  if (!isSameId(request.recipientId, recipientId)) {
    const error = new Error('You are not allowed to accept this chat request');
    error.statusCode = 403;
    throw error;
  }

  const thread = await getOrCreateDirectThread(request.requesterId, request.recipientId, request.participantKeys || []);

  const sent = await sendMessage({
    threadId: thread._id,
    senderId: request.requesterId,
    text: request.initialMessage,
    replyToMessageId: null,
    logContext,
  });

  request.status = 'accepted';
  request.threadId = thread._id;
  request.decidedAt = new Date();
  await request.save();

  return {
    requestId: request._id,
    threadId: thread._id,
    participantIds: thread.participantIds.map((id) => String(id)),
    initialMessage: sent.payload,
  };
}

async function deleteMessage({ messageId, threadId, userId, deleteFor }) {
  const thread = await assertThreadAccess(threadId, userId);

  const message = await Message.findOne(buildVisibleMessageQuery(thread, userId, { _id: messageId }));
  if (!message) {
    const error = new Error('Message not found');
    error.statusCode = 404;
    throw error;
  }

  if (deleteFor === 'everyone') {
    if (!isSameId(message.sender, userId)) {
      const error = new Error('Only the sender can delete a message for everyone');
      error.statusCode = 403;
      throw error;
    }
    message.deletedForEveryone = true;
  } else {
    const alreadyDeleted = (message.deletedFor || []).some((id) => isSameId(id, userId));
    if (!alreadyDeleted) {
      message.deletedFor.push(toObjectId(userId));
    }
  }

  await message.save();
  const participantIds = thread.threadType === 'group'
    ? await listAcceptedGroupMemberIds(thread)
    : (thread.participantIds || []).map((id) => String(id));

  return { messageId: String(message._id), deleteFor, participantIds };
}

async function rejectChatRequest({ requestId, recipientId }) {
  const request = await ChatRequest.findById(requestId);

  if (!request || request.status !== 'pending') {
    const error = new Error('Chat request not found or no longer pending');
    error.statusCode = 404;
    throw error;
  }

  if (!isSameId(request.recipientId, recipientId)) {
    const error = new Error('You are not allowed to reject this chat request');
    error.statusCode = 403;
    throw error;
  }

  request.status = 'rejected';
  request.lockAfterRejection = true;
  request.decidedAt = new Date();
  await request.save();

  return { ok: true };
}

module.exports = {
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
  deleteExpiredEphemeralMessages,
  assertThreadAccess,
  getEncryptedThreadKeyForUser,
  searchCustomerByEmail,
  listIncomingRequests,
  listOutgoingRequests,
  listAcceptedFriends,
  createChatRequest,
  acceptChatRequest,
  rejectChatRequest,
  deleteMessage,
  listAcceptedGroupMemberIds,
  buildVisibleMessageQuery,
};
