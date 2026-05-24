import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

function formatTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function avatarHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return Math.abs(hash) % 360;
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0] || '').slice(0, 2).join('').toUpperCase();
}

function CustomerDashboardPage() {
  const api = useMemo(() => createApiClient(), []);
  const navigate = useNavigate();
  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [threads, setThreads] = useState<DashboardThread[]>([]);
  const [incoming, setIncoming] = useState<DashboardIncoming[]>([]);
  const [outgoing, setOutgoing] = useState<DashboardOutgoing[]>([]);

  async function loadDashboard() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [threadsRes, incomingRes, outgoingRes] = await Promise.all([
        api.get('/api/chat/threads'),
        api.get('/api/chat/requests/incoming'),
        api.get('/api/chat/requests/outgoing'),
      ]);
      setThreads(threadsRes.data.threads || []);
      setIncoming(incomingRes.data.requests || []);
      setOutgoing(outgoingRes.data.requests || []);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setErrorMsg(axiosError.response?.data?.message || 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recentThreads = [...threads]
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
    .slice(0, 6);

  const pendingIn = incoming.filter((r) => r);
  const pendingOut = outgoing.filter((r) => r.status === 'pending');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="dash-root">
      {/* ── hero ─────────────────────────────────── */}
      <header className="dash-hero">
        <div className="dash-hero-text">
          <p className="brand-kicker">ShadowLink</p>
          <h2>{greeting}{currentUser?.username ? `, ${currentUser.username}` : ''} 👋</h2>
          <p className="dash-hero-sub">Your end-to-end encrypted workspace is ready.</p>
        </div>
        <div className="dash-hero-actions">
          <button type="button" className="dash-cta" onClick={() => navigate('/chat')}>
            <span className="dash-cta-icon">💬</span>Open chat
          </button>
          <button type="button" className="dash-cta secondary" onClick={() => navigate('/friends')}>
            <span className="dash-cta-icon">👥</span>Friends
          </button>
          <button type="button" className="dash-cta secondary" onClick={loadDashboard} aria-label="Refresh dashboard">
            <span className="dash-cta-icon">↻</span>Refresh
          </button>
        </div>
      </header>

      {/* ── KPI row ──────────────────────────────── */}
      <div className="dash-kpi-row">
        {[
          { label: 'Active conversations', value: threads.length, icon: '💬', color: 'blue' },
          { label: 'Contacts', value: threads.length, icon: '👥', color: 'purple' },
          { label: 'Incoming requests', value: pendingIn.length, icon: '📩', color: pendingIn.length > 0 ? 'amber' : 'neutral' },
          { label: 'Outgoing pending', value: pendingOut.length, icon: '⏳', color: pendingOut.length > 0 ? 'amber' : 'neutral' },
        ].map(({ label, value, icon, color }) => (
          <article key={label} className={`dash-kpi dash-kpi--${color}`}>
            <span className="dash-kpi-icon">{icon}</span>
            <strong className="dash-kpi-value">{loading ? '…' : value}</strong>
            <span className="dash-kpi-label">{label}</span>
          </article>
        ))}
      </div>

      {errorMsg && <p className="status error">{errorMsg}</p>}

      <div className="dash-body">
        {/* ── Recent conversations ─────────────────── */}
        <section className="dash-panel">
          <header className="dash-panel-head">
            <h3>Recent conversations</h3>
            <button type="button" className="dash-link" onClick={() => navigate('/contacts')}>View all →</button>
          </header>
          {loading && <p className="status">Loading…</p>}
          {!loading && recentThreads.length === 0 && (
            <div className="dash-empty">
              <p>No conversations yet.</p>
              <button type="button" className="dash-cta" onClick={() => navigate('/chat')}>Start one</button>
            </div>
          )}
          <ul className="dash-thread-list">
            {recentThreads.map((thread) => {
              const peer = thread.participants.find((p) => p.id !== currentUser?.id);
              const hue = avatarHue(peer?.username || '');
              return (
                <li
                  key={thread.id}
                  className="dash-thread-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/chat?thread=${thread.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/chat?thread=${thread.id}`)}
                >
                  <div className="dash-avatar" style={{ '--avatar-hue': hue } as React.CSSProperties}>
                    {initials(peer?.username || '?')}
                  </div>
                  <div className="dash-thread-info">
                    <strong>{peer?.username || 'Group'}</strong>
                    <span className="dash-thread-sub">{peer?.email}</span>
                  </div>
                  <div className="dash-thread-meta">
                    <span className="dash-thread-count">{thread.messageCount} msg{thread.messageCount !== 1 ? 's' : ''}</span>
                    <span className="dash-thread-time">{formatTime(thread.lastActivityAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Right column ─────────────────────────── */}
        <div className="dash-aside">
          {/* Pending incoming requests */}
          <section className="dash-panel">
            <header className="dash-panel-head">
              <h3>Incoming requests {pendingIn.length > 0 && <span className="dash-badge">{pendingIn.length}</span>}</h3>
              <button type="button" className="dash-link" onClick={() => navigate('/chat')}>Review →</button>
            </header>
            {loading && <p className="status">Loading…</p>}
            {!loading && pendingIn.length === 0 && <p className="dash-empty-sm">No pending requests.</p>}
            <ul className="dash-req-list">
              {pendingIn.slice(0, 4).map((req) => {
                const hue = avatarHue(req.requester.username);
                return (
                  <li key={req.id} className="dash-req-item">
                    <div className="dash-avatar dash-avatar--sm" style={{ '--avatar-hue': hue } as React.CSSProperties}>
                      {initials(req.requester.username)}
                    </div>
                    <div className="dash-req-info">
                      <strong>{req.requester.username}</strong>
                      <span>{req.requester.email}</span>
                    </div>
                    <span className="dash-req-time">{formatTime(req.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Outgoing requests */}
          <section className="dash-panel">
            <header className="dash-panel-head">
              <h3>Outgoing requests</h3>
            </header>
            {!loading && outgoing.length === 0 && <p className="dash-empty-sm">None sent yet.</p>}
            <ul className="dash-req-list">
              {outgoing.slice(0, 4).map((req) => {
                const hue = avatarHue(req.recipient.username);
                return (
                  <li key={req.id} className="dash-req-item">
                    <div className="dash-avatar dash-avatar--sm" style={{ '--avatar-hue': hue } as React.CSSProperties}>
                      {initials(req.recipient.username)}
                    </div>
                    <div className="dash-req-info">
                      <strong>{req.recipient.username}</strong>
                      <span>{req.recipient.email}</span>
                    </div>
                    <span className={`badge ${req.status === 'accepted' ? 'good' : req.status === 'rejected' ? 'danger' : 'warn'}`}>
                      {req.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default CustomerDashboardPage;
