import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';

type ThreadParticipant = { id: string; username: string; email: string };
type DashboardThread = {
  id: string;
  participants: ThreadParticipant[];
  lastActivityAt: string;
  messageCount: number;
  lastMessage?: { text: string; senderName: string; createdAt: string } | null;
};
type DashboardIncoming = {
  id: string;
  requester: { id: string; username: string; email: string };
  createdAt: string;
};
type DashboardOutgoing = {
  id: string;
  recipient: { id: string; username: string; email: string };
  status: 'pending' | 'accepted' | 'rejected' | string;
  lockAfterRejection: boolean;
  createdAt: string;
  decidedAt?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function CustomerDashboardPage() {
  const api = useMemo(() => createApiClient(), []);
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [threads, setThreads] = useState<DashboardThread[]>([]);
  const [incoming, setIncoming] = useState<DashboardIncoming[]>([]);
  const [outgoing, setOutgoing] = useState<DashboardOutgoing[]>([]);

  async function loadDashboard() {
    setLoading(true);
    setStatus('');
    try {
      const [threadsResponse, incomingResponse, outgoingResponse] = await Promise.all([
        api.get('/api/chat/threads'),
        api.get('/api/chat/requests/incoming'),
        api.get('/api/chat/requests/outgoing'),
      ]);

      setThreads(threadsResponse.data.threads || []);
      setIncoming(incomingResponse.data.requests || []);
      setOutgoing(outgoingResponse.data.requests || []);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus(axiosError.response?.data?.message || 'Unable to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = {
    activeThreads: threads.length,
    incomingRequests: incoming.length,
    outgoingPending: outgoing.filter((item) => item.status === 'pending').length,
    outgoingRejected: outgoing.filter((item) => item.status === 'rejected').length,
  };

  const recentThreads = [...threads]
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
    .slice(0, 5);

  return (
    <section className="customer-dashboard">
      <header className="dashboard-header card">
        <div>
          <p className="brand-kicker">Customer Dashboard</p>
          <h2>Welcome{currentUser?.username ? `, ${currentUser.username}` : ''}</h2>
          <p>Track chat requests, active conversations, and your secure communication status.</p>
        </div>
        <div className="dashboard-links">
          <NavLink className="secondary" to="/chat">Open chat</NavLink>
          <NavLink className="secondary" to="/profile">Manage profile</NavLink>
          <button type="button" className="secondary" onClick={loadDashboard}>Refresh</button>
        </div>
      </header>

      <div className="dashboard-grid">
        <article className="card stat-card"><span>Active threads</span><strong>{stats.activeThreads}</strong></article>
        <article className="card stat-card"><span>Incoming requests</span><strong>{stats.incomingRequests}</strong></article>
        <article className="card stat-card"><span>Outgoing pending</span><strong>{stats.outgoingPending}</strong></article>
        <article className="card stat-card"><span>Rejected by recipients</span><strong>{stats.outgoingRejected}</strong></article>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <header className="card-header">
            <h3>Pending incoming requests</h3>
            <NavLink to="/chat" className="secondary">Review in chat</NavLink>
          </header>
          {incoming.length === 0 ? (
            <p className="empty-state">No pending requests.</p>
          ) : (
            <ul className="dashboard-list">
              {incoming.slice(0, 5).map((request) => (
                <li key={request.id}>
                  <strong>{request.requester.username}</strong>
                  <span>{request.requester.email}</span>
                  <span className="muted">{formatDate(request.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <header className="card-header">
            <h3>Outgoing requests</h3>
          </header>
          {outgoing.length === 0 ? (
            <p className="empty-state">You have not sent any chat requests yet.</p>
          ) : (
            <ul className="dashboard-list">
              {outgoing.slice(0, 5).map((request) => (
                <li key={request.id}>
                  <strong>{request.recipient.username}</strong>
                  <span>{request.recipient.email}</span>
                  <span className={`badge ${request.status === 'accepted' ? 'good' : request.status === 'rejected' ? 'danger' : 'warn'}`}>
                    {request.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <header className="card-header">
          <h3>Recent active threads</h3>
          <NavLink to="/chat" className="secondary">Open chat</NavLink>
        </header>
        {recentThreads.length === 0 ? (
          <p className="empty-state">No active threads yet. Search for a customer in the chat page to start a secure conversation.</p>
        ) : (
          <ul className="dashboard-list">
            {recentThreads.map((thread) => {
              const peer = thread.participants.find((participant) => participant.id !== currentUser?.id);
              return (
                <li key={thread.id}>
                  <strong>{peer?.username || 'Group thread'}</strong>
                  <span>{thread.messageCount} message{thread.messageCount === 1 ? '' : 's'}</span>
                  <span className="muted">Last active {formatDate(thread.lastActivityAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {loading && <p className="status">Loading dashboard...</p>}
      {status && <p className="status error">{status}</p>}
    </section>
  );
}

export default CustomerDashboardPage;
