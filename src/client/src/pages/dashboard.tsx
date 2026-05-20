import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';

function CustomerDashboardPage() {
  const api = useMemo(() => createApiClient(), []);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [stats, setStats] = useState({
    activeThreads: 0,
    incomingRequests: 0,
    outgoingPending: 0,
    outgoingRejected: 0,
  });

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const [threadsResponse, incomingResponse, outgoingResponse] = await Promise.all([
          api.get('/api/chat/threads'),
          api.get('/api/chat/requests/incoming'),
          api.get('/api/chat/requests/outgoing'),
        ]);

        const threads = threadsResponse.data.threads || [];
        const incoming = incomingResponse.data.requests || [];
        const outgoing = outgoingResponse.data.requests || [];

        setStats({
          activeThreads: threads.length,
          incomingRequests: incoming.length,
          outgoingPending: outgoing.filter((item: any) => item.status === 'pending').length,
          outgoingRejected: outgoing.filter((item: any) => item.status === 'rejected').length,
        });
      } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        setStatus(axiosError.response?.data?.message || 'Unable to load dashboard metrics.');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [api]);

  return (
    <section className="customer-dashboard">
      <header className="dashboard-header card">
        <div>
          <p className="brand-kicker">Customer Dashboard</p>
          <h2>Secure Messaging Overview</h2>
          <p>Track chat requests, active conversations, and your secure communication status.</p>
        </div>
        <div className="dashboard-links">
          <NavLink className="secondary" to="/chat">Open chat</NavLink>
          <NavLink className="secondary" to="/profile">Manage profile</NavLink>
        </div>
      </header>

      <div className="dashboard-grid">
        <article className="card stat-card"><span>Active threads</span><strong>{stats.activeThreads}</strong></article>
        <article className="card stat-card"><span>Incoming requests</span><strong>{stats.incomingRequests}</strong></article>
        <article className="card stat-card"><span>Outgoing pending</span><strong>{stats.outgoingPending}</strong></article>
        <article className="card stat-card"><span>Rejected by recipients</span><strong>{stats.outgoingRejected}</strong></article>
      </div>

      {loading && <p className="status">Loading dashboard...</p>}
      {status && <p className="status error">{status}</p>}
    </section>
  );
}

export default CustomerDashboardPage;
