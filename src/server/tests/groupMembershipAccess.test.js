const mongoose = require('mongoose');

jest.mock('../models/ChatThread', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('../models/ChatRequest', () => ({}));

jest.mock('../models/GroupMember', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../models/User', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../models/Message', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  deleteOne: jest.fn(),
}));

jest.mock('../models/EphemeralMessageLog', () => ({
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../models/MessageIntegrityLog', () => ({
  create: jest.fn(),
}));

jest.mock('../services/logger', () => ({
  logEncryption: jest.fn(),
  logMessageSecurity: jest.fn(),
}));

const ChatThread = require('../models/ChatThread');
const GroupMember = require('../models/GroupMember');
const Message = require('../models/Message');
const {
  acceptGroupInvitation,
  assertThreadAccess,
  buildVisibleMessageQuery,
  listAcceptedGroupMemberIds,
  sendMessage,
} = require('../services/chatService');

function objectId() {
  return new mongoose.Types.ObjectId();
}

function findChain(value) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('group invitation access control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies group access while an invitation is still pending', async () => {
    const groupId = objectId();
    const userId = objectId();

    ChatThread.findById.mockResolvedValue({
      _id: groupId,
      threadType: 'group',
      status: 'active',
      participantIds: [],
      createdBy: objectId(),
    });
    GroupMember.findOne.mockResolvedValue({
      groupId,
      userId,
      status: 'pending',
      joinedAt: null,
    });

    await expect(assertThreadAccess(groupId, userId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('accepts an invitation by setting acceptedAt and joinedAt and adding the member to the thread', async () => {
    const invitationId = objectId();
    const groupId = objectId();
    const userId = objectId();
    const invitation = {
      _id: invitationId,
      groupId,
      userId,
      status: 'pending',
      save: jest.fn().mockResolvedValue(true),
    };

    GroupMember.findById.mockResolvedValue(invitation);
    ChatThread.findById.mockResolvedValue({
      _id: groupId,
      threadType: 'group',
      status: 'active',
      lastActivityAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    ChatThread.findByIdAndUpdate.mockResolvedValue({});

    const result = await acceptGroupInvitation({ invitationId, userId });

    expect(result.threadId).toEqual(groupId);
    expect(invitation.status).toBe('accepted');
    expect(invitation.acceptedAt).toBeInstanceOf(Date);
    expect(invitation.joinedAt).toBeInstanceOf(Date);
    expect(ChatThread.findByIdAndUpdate).toHaveBeenCalledWith(groupId, expect.objectContaining({
      $addToSet: { participantIds: userId },
    }));
  });

  it('adds joinedAt to group message queries so older history is not read', () => {
    const joinedAt = new Date('2026-05-21T10:00:00.000Z');
    const groupId = objectId();
    const thread = {
      _id: groupId,
      threadType: 'group',
      accessMembership: { joinedAt },
    };

    const query = buildVisibleMessageQuery(thread, objectId(), { deletedForEveryone: { $ne: true } });

    expect(query).toEqual({
      threadId: groupId,
      deletedForEveryone: { $ne: true },
      createdAt: { $gte: joinedAt },
    });
  });

  it('blocks sending group messages for pending invitees before a message is stored', async () => {
    const groupId = objectId();
    const userId = objectId();

    ChatThread.findById.mockResolvedValue({
      _id: groupId,
      threadType: 'group',
      status: 'active',
      participantIds: [],
      createdBy: objectId(),
    });
    GroupMember.findOne.mockResolvedValue({
      groupId,
      userId,
      status: 'pending',
      joinedAt: null,
    });

    await expect(sendMessage({
      threadId: groupId,
      senderId: userId,
      text: {
        ciphertext: 'x'.repeat(24),
        iv: 'x'.repeat(24),
        authTag: 'x'.repeat(24),
        algorithm: 'aes-256-gcm',
      },
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(Message.create).not.toHaveBeenCalled();
  });

  it('uses accepted memberships only when choosing realtime group recipients', async () => {
    const acceptedUser = objectId();
    const pendingUser = objectId();

    GroupMember.find.mockReturnValue(findChain([
      { userId: acceptedUser, status: 'accepted', joinedAt: new Date() },
      { userId: pendingUser, status: 'pending', joinedAt: null },
    ]));

    await expect(listAcceptedGroupMemberIds(objectId())).resolves.toEqual([String(acceptedUser)]);
  });
});
