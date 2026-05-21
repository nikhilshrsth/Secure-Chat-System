import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';
import {
  encryptThreadKeyForUser,
  generateThreadKeyRaw,
  getOrCreateIdentity,
} from '../lib/chatE2ee';

type ThreadParticipant = {
  id: string;
  username: string;
  email: string;
  publicKey?: string | null;
  keyExchangePublicKey?: string | null;
};

type ChatThread = {
  id: string;
  threadType: string;
  name?: string | null;
  participants: ThreadParticipant[];
  lastActivityAt: string;
  messageCount: number;
};

type ChatUser = {
  id: string;
  username: string;
  email: string;
  publicKey?: string | null;
  keyExchangePublicKey?: string | null;
};

type GroupInvitation = {
  id: string;
  groupId: string;
  group: {
    id: string;
    name?: string | null;
    createdAt?: string | null;
  };
  invitedBy: {
    id: string;
    username: string;
    email?: string | null;
  };
  status: string;
  invitedAt: string;
};

type RawChatUser = {
  id?: string;
  _id?: string;
  username: string;
  email: string;
  publicKey?: string | null;
  keyExchangePublicKey?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return 'No activity yet';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function groupTitle(group: ChatThread) {
  return group.name || `Group with ${group.participants.map((participant) => participant.username).join(', ')}`;
}

function GroupsPage() {
  const api = useMemo(() => createApiClient(), []);
  const navigate = useNavigate();
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);

  const [groups, setGroups] = useState<ChatThread[]>([]);
  const [groupInvitations, setGroupInvitations] = useState<GroupInvitation[]>([]);
  const [availableUsers, setAvailableUsers] = useState<ChatUser[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [manageName, setManageName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupParticipantIds, setGroupParticipantIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [decidingInviteId, setDecidingInviteId] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || groups[0] || null;

  async function refreshGroups(nextSelectedId?: string) {
    const response = await api.get('/api/chat/threads');
    const nextGroups = ((response.data.threads || []) as ChatThread[])
      .filter((thread) => thread.threadType === 'group');
    setGroups(nextGroups);

    const targetId = nextSelectedId || selectedGroupId;
    if (targetId && nextGroups.some((group) => group.id === targetId)) {
      setSelectedGroupId(targetId);
      return;
    }

    setSelectedGroupId(nextGroups[0]?.id || '');
  }

  async function refreshUsers() {
    const response = await api.get('/api/chat/users');
    const normalizedUsers = ((response.data.users || []) as RawChatUser[])
      .map((user) => ({
        id: String(user.id || user._id || ''),
        username: user.username,
        email: user.email,
        publicKey: user.publicKey || null,
        keyExchangePublicKey: user.keyExchangePublicKey || null,
      }))
      .filter((user) => user.id);

    setAvailableUsers(normalizedUsers);
  }

  async function refreshInvitations() {
    const response = await api.get('/api/chat/groups/invitations');
    setGroupInvitations(response.data.invitations || []);
  }

  useEffect(() => {
    async function handleGroupInvitation() {
      try {
        await refreshInvitations();
        setStatus({ type: 'success', message: 'New group invitation received.' });
      } catch {
        // The next page load will fetch pending invitations again.
      }
    }

    window.addEventListener('securechat-group-invitation', handleGroupInvitation);
    return () => window.removeEventListener('securechat-group-invitation', handleGroupInvitation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const identity = await getOrCreateIdentity();
        await api.put('/api/chat/keys/public', {
          publicKey: identity.publicKey,
          keyExchangePublicKey: identity.keyExchangePublicKey,
        });
        await Promise.all([refreshGroups(), refreshUsers(), refreshInvitations()]);
      } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to load groups.' });
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setManageName(selectedGroup?.name || '');
  }, [selectedGroup?.id, selectedGroup?.name]);

  async function createGroup() {
    if (groupParticipantIds.length < 2) {
      setStatus({ type: 'warn', message: 'Select at least two customers to create a group.' });
      return;
    }

    setCreating(true);
    setStatus({ type: '', message: '' });

    try {
      const identity = await getOrCreateIdentity();
      const threadKey = await generateThreadKeyRaw();
      const participants = [
        {
          id: currentUser.id,
          publicKey: identity.publicKey,
          keyExchangePublicKey: identity.keyExchangePublicKey,
        },
        ...availableUsers
          .filter((user) => groupParticipantIds.includes(String(user.id)))
          .map((user) => ({
            id: String(user.id),
            publicKey: String(user.publicKey || ''),
            keyExchangePublicKey: user.keyExchangePublicKey || null,
          })),
      ];

      if (participants.some((participant) => !participant.publicKey)) {
        throw new Error('One or more selected customers have not activated secure chat yet.');
      }

      const participantKeys = await Promise.all(
        participants.map(async (participant) => ({
          userId: participant.id,
          encryptedKey: await encryptThreadKeyForUser(
            threadKey,
            participant.publicKey,
            participant.keyExchangePublicKey,
            identity,
          ),
        })),
      );

      const response = await api.post('/api/chat/threads/group', {
        name: groupName,
        participantIds: groupParticipantIds,
        participantKeys,
      });

      const threadId = String(response.data?.thread?.id || '');
      setGroupName('');
      setGroupParticipantIds([]);
      setStatus({ type: 'success', message: 'Encrypted group created and invitations sent.' });
      await refreshGroups(threadId || undefined);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({
        type: 'error',
        message: axiosError.response?.data?.message || (error as Error).message || 'Unable to create group.',
      });
    } finally {
      setCreating(false);
    }
  }

  async function saveGroupName() {
    if (!selectedGroup || savingName) return;

    setSavingName(true);
    setStatus({ type: '', message: '' });

    try {
      await api.put(`/api/chat/threads/${selectedGroup.id}/group`, { name: manageName });
      setStatus({ type: 'success', message: 'Group updated.' });
      await refreshGroups(selectedGroup.id);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to update group.' });
    } finally {
      setSavingName(false);
    }
  }

  async function acceptInvitation(invitationId: string) {
    setDecidingInviteId(invitationId);
    setStatus({ type: '', message: '' });

    try {
      const response = await api.post(`/api/chat/groups/invitations/${invitationId}/accept`);
      const threadId = String(response.data?.threadId || '');
      await Promise.all([refreshGroups(threadId || undefined), refreshInvitations()]);
      setStatus({ type: 'success', message: 'Group invitation accepted. Only new messages from this join time are available.' });
      if (threadId) {
        navigate(`/chat?thread=${threadId}`);
      }
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to accept invitation.' });
    } finally {
      setDecidingInviteId('');
    }
  }

  async function declineInvitation(invitationId: string) {
    setDecidingInviteId(invitationId);
    setStatus({ type: '', message: '' });

    try {
      await api.post(`/api/chat/groups/invitations/${invitationId}/decline`);
      setStatus({ type: 'success', message: 'Group invitation declined.' });
      await refreshInvitations();
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to decline invitation.' });
    } finally {
      setDecidingInviteId('');
    }
  }

  function toggleParticipant(userId: string, checked: boolean) {
    setGroupParticipantIds((previous) => (
      checked ? [...previous, userId] : previous.filter((id) => id !== userId)
    ));
  }

  return (
    <section className="groups-shell">
      <header className="groups-header card">
        <div>
          <p className="brand-kicker">End-to-end encrypted</p>
          <h2>Groups</h2>
          <p>View existing encrypted group chats, manage names, and create new groups.</p>
        </div>
        <span className="contacts-count">{groups.length} group{groups.length !== 1 ? 's' : ''}</span>
      </header>

      {status.message && <p className={`status ${status.type}`}>{status.message}</p>}
      {loading && <p className="status">Loading groups...</p>}

      {!loading && (
        <div className="groups-layout">
          <aside className="groups-list-panel card">
            <h3>Existing groups</h3>
            {groupInvitations.length > 0 && (
              <div className="groups-invitations">
                <h4>Pending invitations</h4>
                {groupInvitations.map((invitation) => (
                  <div key={invitation.id} className="groups-invitation">
                    <strong>{invitation.group.name || 'Encrypted group'}</strong>
                    <span>Invited by {invitation.invitedBy.username} - {formatDate(invitation.invitedAt)}</span>
                    <div className="groups-actions compact">
                      <button
                        type="button"
                        className="submit"
                        onClick={() => acceptInvitation(invitation.id)}
                        disabled={decidingInviteId === invitation.id}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => declineInvitation(invitation.id)}
                        disabled={decidingInviteId === invitation.id}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {groups.length === 0 && <p className="empty-state">No groups yet. Create one to start a shared encrypted chat.</p>}
            <div className="groups-list">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={selectedGroup?.id === group.id ? 'group-list-item active' : 'group-list-item'}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <strong>{groupTitle(group)}</strong>
                  <span>{group.participants.length} members · {group.messageCount} messages</span>
                  <span>Last active {formatDate(group.lastActivityAt)}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="groups-manage-panel card">
            <h3>Manage group</h3>
            {!selectedGroup ? (
              <p className="empty-state">Select a group to view and manage it.</p>
            ) : (
              <>
                <label className="groups-field">
                  <span>Group name</span>
                  <input
                    value={manageName}
                    onChange={(event) => setManageName(event.target.value)}
                    placeholder="Group name"
                    maxLength={120}
                  />
                </label>
                <div className="groups-actions">
                  <button type="button" className="submit" onClick={saveGroupName} disabled={savingName}>
                    {savingName ? 'Saving...' : 'Save name'}
                  </button>
                  <button type="button" className="secondary" onClick={() => navigate(`/chat?thread=${selectedGroup.id}`)}>
                    Open chat
                  </button>
                </div>

                <div className="groups-members">
                  <h4>Members</h4>
                  {selectedGroup.participants.map((participant) => (
                    <div key={participant.id} className="groups-member">
                      <strong>{participant.username}{String(participant.id) === String(currentUser?.id) ? ' (you)' : ''}</strong>
                      <span>{participant.email}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </main>

          <section className="groups-create-panel card">
            <h3>Create new group</h3>
            <label className="groups-field">
              <span>Group name</span>
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Optional group name"
                maxLength={120}
              />
            </label>

            <div className="groups-picker">
              {availableUsers.map((user) => {
                const disabled = !user.publicKey;
                return (
                  <label key={user.id} className={disabled ? 'groups-picker-item disabled' : 'groups-picker-item'}>
                    <input
                      type="checkbox"
                      checked={groupParticipantIds.includes(user.id)}
                      disabled={disabled}
                      onChange={(event) => toggleParticipant(user.id, event.target.checked)}
                    />
                    <span>
                      <strong>{user.username}</strong>
                      <small>{user.email}</small>
                      {disabled && <small>Secure chat key not published yet</small>}
                    </span>
                  </label>
                );
              })}
            </div>

            <button type="button" className="submit" onClick={createGroup} disabled={creating}>
              {creating ? 'Creating...' : 'Create group invitations'}
            </button>
          </section>
        </div>
      )}
    </section>
  );
}

export default GroupsPage;
