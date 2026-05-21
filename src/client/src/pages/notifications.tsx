import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';
import {
  decryptMessageText,
  decryptThreadKeyForUser,
  getOrCreateIdentity,
} from '../lib/chatE2ee';

type IncomingRequest = {
  id: string;
  requester: {
    id: string;
    username: string;
    email: string;
    publicKey?: string | null;
    keyExchangePublicKey?: string | null;
  };
  status: string;
  initialMessage: {
    ciphertext: string;
    iv: string;
    authTag: string;
    algorithm: string;
  };
  participantKeys: Array<{ userId: string; encryptedKey: string }>;
  createdAt: string;
  preview?: string;
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

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function NotificationsPage() {
  const api = useMemo(() => createApiClient(), []);
  const navigate = useNavigate();
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);

  const [requests, setRequests] = useState<(IncomingRequest & { preview: string })[]>([]);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [decidingId, setDecidingId] = useState('');

  async function loadAll() {
    setLoading(true);
    try {
      const identity = await getOrCreateIdentity();

      const [reqRes, invRes] = await Promise.all([
        api.get('/api/chat/requests/incoming'),
        api.get('/api/chat/groups/invitations'),
      ]);

      const rawRequests: IncomingRequest[] = (reqRes.data.requests || []).filter(
        (r: IncomingRequest) => r.status === 'pending',
      );

      const withPreviews = await Promise.all(
        rawRequests.map(async (request) => {
          try {
            const keyEntry = request.participantKeys.find(
              (item) => String(item.userId) === String(currentUser?.id),
            );
            if (!keyEntry) return { ...request, preview: '[Unable to decrypt]' };
            const threadKey = await decryptThreadKeyForUser(keyEntry.encryptedKey, identity);
            const preview = await decryptMessageText(request.initialMessage, threadKey);
            return { ...request, preview };
          } catch {
            return { ...request, preview: '[Unable to decrypt]' };
          }
        }),
      );

      setRequests(withPreviews);
      setInvitations(invRes.data.invitations || []);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to load notifications.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // Re-load when a new group invitation is received via socket broadcast.
    function handleGroupInvitation() {
      loadAll().catch(() => {});
    }
    window.addEventListener('securechat-group-invitation', handleGroupInvitation);
    return () => window.removeEventListener('securechat-group-invitation', handleGroupInvitation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptRequest(requestId: string) {
    setDecidingId(requestId);
    setStatus({ type: '', message: '' });
    try {
      await api.post(`/api/chat/requests/${requestId}/accept`);
      setStatus({ type: 'success', message: 'Chat request accepted.' });
      await loadAll();
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to accept request.' });
    } finally {
      setDecidingId('');
    }
  }

  async function rejectRequest(requestId: string) {
    setDecidingId(requestId);
    setStatus({ type: '', message: '' });
    try {
      await api.post(`/api/chat/requests/${requestId}/reject`);
      setStatus({ type: 'success', message: 'Chat request rejected.' });
      await loadAll();
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to reject request.' });
    } finally {
      setDecidingId('');
    }
  }

  async function acceptInvitation(invitationId: string) {
    setDecidingId(invitationId);
    setStatus({ type: '', message: '' });
    try {
      const response = await api.post(`/api/chat/groups/invitations/${invitationId}/accept`);
      const threadId = String(response.data?.threadId || '');
      setStatus({ type: 'success', message: 'Group invitation accepted.' });
      await loadAll();
      if (threadId) navigate(`/chat?thread=${threadId}`);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to accept invitation.' });
    } finally {
      setDecidingId('');
    }
  }

  async function declineInvitation(invitationId: string) {
    setDecidingId(invitationId);
    setStatus({ type: '', message: '' });
    try {
      await api.post(`/api/chat/groups/invitations/${invitationId}/decline`);
      setStatus({ type: 'success', message: 'Group invitation declined.' });
      await loadAll();
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to decline invitation.' });
    } finally {
      setDecidingId('');
    }
  }

  const totalCount = requests.length + invitations.length;

  return (
    <section className="notif-shell">
      {status.message && <p className={`status ${status.type}`}>{status.message}</p>}
      {loading && <p className="status">Loading notifications...</p>}

      {!loading && totalCount === 0 && (
        <div className="card notif-empty">
          <p className="empty-state">No pending notifications — you are all caught up.</p>
        </div>
      )}

      {!loading && requests.length > 0 && (
        <section className="notif-section card">
          <h3 className="notif-section-title">
            Chat requests
            <span className="count-badge">{requests.length}</span>
          </h3>
          <div className="notif-list">
            {requests.map((request) => (
              <div key={request.id} className="notif-item">
                <div className="notif-item-meta">
                  <strong>{request.requester.username}</strong>
                  <span className="notif-item-sub">{request.requester.email}</span>
                  <span className="notif-item-time">{formatDate(request.createdAt)}</span>
                </div>
                <p className="notif-item-preview">{request.preview}</p>
                <div className="notif-item-actions">
                  <button
                    type="button"
                    className="submit"
                    onClick={() => acceptRequest(request.id)}
                    disabled={decidingId === request.id}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => rejectRequest(request.id)}
                    disabled={decidingId === request.id}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && invitations.length > 0 && (
        <section className="notif-section card">
          <h3 className="notif-section-title">
            Group invitations
            <span className="count-badge">{invitations.length}</span>
          </h3>
          <div className="notif-list">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="notif-item">
                <div className="notif-item-meta">
                  <strong>{invitation.group.name || 'Encrypted group'}</strong>
                  <span className="notif-item-sub">Invited by {invitation.invitedBy.username}</span>
                  <span className="notif-item-time">{formatDate(invitation.invitedAt)}</span>
                </div>
                <div className="notif-item-actions">
                  <button
                    type="button"
                    className="submit"
                    onClick={() => acceptInvitation(invitation.id)}
                    disabled={decidingId === invitation.id}
                  >
                    Accept &amp; join
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => declineInvitation(invitation.id)}
                    disabled={decidingId === invitation.id}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

export default NotificationsPage;
