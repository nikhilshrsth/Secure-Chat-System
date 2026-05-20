import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';

const navItems = [
  ['overview', 'Security Overview'],
  ['users', 'Customer Accounts'],
  ['loginAttempts', 'Login Attempts'],
  ['alerts', 'Suspicious Alerts'],
  ['threads', 'Threads & Groups'],
  ['integrity', 'Message Integrity'],
  ['ephemeral', 'Ephemeral Messages'],
  ['systemLogs', 'System Logs'],
  ['audit', 'Admin Audit Trail'],
  ['devsecops', 'DevSecOps Status'],
] as const;

// These section descriptions document how each dashboard view supports secure-chat
// monitoring and cybersecurity assessment while deliberately showing metadata only.
const sectionDescriptions: Record<string, string> = {
  overview: 'Aggregated security metadata for authentication, encrypted traffic, integrity checks, and CI/CD posture.',
  users: 'Customer account oversight for activation, suspension, and login history. Admins cannot edit customer profile information, roles, or 2FA secrets.',
  loginAttempts: 'Authentication telemetry used to detect brute force, repeated MFA failures, disabled-account attempts, and IP anomalies.',
  alerts: 'Suspicious activity queue for admin triage, notes, status changes, and containment actions.',
  threads: 'Direct and group chat metadata only; encrypted message plaintext and keys are never displayed.',
  integrity: 'Hash/HMAC verification metadata for encrypted messages, including failures that trigger suspicious alerts.',
  ephemeral: 'Expiry and deletion metadata for ephemeral encrypted messages, including failed deletion monitoring.',
  systemLogs: 'Searchable security logs for auth, authorization, WebSocket, key exchange, database, error, and admin events.',
  audit: 'Immutable-style trail of admin actions for accountability and cybersecurity assessment evidence.',
  devsecops: 'Latest build, SAST, DAST, dependency, test, deployment, and rollback status for secure delivery monitoring.',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function badgeClass(value?: string) {
  const normalized = String(value || '').toLowerCase();
  if (['critical', 'failed', 'disabled', 'suspended', 'high'].includes(normalized)) return 'badge danger';
  if (['warning', 'warn', 'medium', 'investigating', 'pending'].includes(normalized)) return 'badge warn';
  if (['passed', 'success', 'active', 'enabled', 'valid', 'deleted', 'resolved', 'low'].includes(normalized)) return 'badge good';
  return 'badge neutral';
}

function BarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...data.map((item) => item.value || 0));

  return (
    <div className="mini-chart">
      {data.length === 0 && <p className="empty-state">No chart data yet.</p>}
      {data.map((item) => (
        <div className="chart-row" key={item.label}>
          <span>{item.label}</span>
          <div className="chart-track">
            <i style={{ width: `${Math.max(6, ((item.value || 0) / max) * 100)}%` }} />
          </div>
          <strong>{item.value || 0}</strong>
        </div>
      ))}
    </div>
  );
}

function AdminDashboardPage() {
  const navigate = useNavigate();
  const api = useMemo(() => createApiClient(), []);
  const storedUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);
  const [activeSection, setActiveSection] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [systemLogSearch, setSystemLogSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const hasLoadedDashboard = useRef(false);
  const [data, setData] = useState<Record<string, any>>({
    overview: { summary: {}, charts: {} },
    users: [],
    loginAttempts: [],
    alerts: [],
    threads: [],
    integrity: [],
    ephemeral: [],
    systemLogs: [],
    audit: [],
    devsecops: null,
  });

  async function loadDashboard() {
    setLoading(true);
    setStatus({ type: '', message: '' });
    try {
      const overview = await api.get('/api/admin/dashboard');

      setData((prev) => ({
        ...prev,
        overview: overview.data,
      }));
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to load admin dashboard.' });
    } finally {
      setLoading(false);
    }
  }

  async function loadSectionData(section: string) {
    try {
      if (section === 'overview') {
        const response = await api.get('/api/admin/dashboard');
        setData((prev) => ({ ...prev, overview: response.data }));
        return;
      }

      if (section === 'users') {
        await refreshUsers('');
        return;
      }

      if (section === 'loginAttempts') {
        const response = await api.get('/api/admin/login-attempts');
        setData((prev) => ({ ...prev, loginAttempts: response.data.attempts || [] }));
        return;
      }

      if (section === 'alerts') {
        await refreshAlerts();
        return;
      }

      if (section === 'threads') {
        const response = await api.get('/api/admin/threads');
        setData((prev) => ({ ...prev, threads: response.data.threads || [] }));
        return;
      }

      if (section === 'integrity') {
        const response = await api.get('/api/admin/message-integrity');
        setData((prev) => ({ ...prev, integrity: response.data.logs || [] }));
        return;
      }

      if (section === 'ephemeral') {
        const response = await api.get('/api/admin/ephemeral-messages');
        setData((prev) => ({ ...prev, ephemeral: response.data.logs || [] }));
        return;
      }

      if (section === 'systemLogs') {
        await refreshSystemLogs('');
        return;
      }

      if (section === 'audit') {
        const response = await api.get('/api/admin/audit-trail');
        setData((prev) => ({ ...prev, audit: response.data.logs || [] }));
        return;
      }

      if (section === 'devsecops') {
        const response = await api.get('/api/admin/devsecops');
        setData((prev) => ({ ...prev, devsecops: response.data.scan || null }));
      }
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || `Unable to load ${section} data.` });
    }
  }

  async function refreshUsers(search = userSearch) {
    const response = await api.get('/api/admin/users', { params: { search } });
    setData((prev) => ({ ...prev, users: response.data.users || [] }));
  }

  async function refreshAlerts() {
    const response = await api.get('/api/admin/alerts');
    setData((prev) => ({ ...prev, alerts: response.data.alerts || [] }));
  }

  async function refreshSystemLogs(search = systemLogSearch) {
    const response = await api.get('/api/admin/system-logs', { params: { search } });
    setData((prev) => ({ ...prev, systemLogs: response.data.logs || [] }));
  }

  useEffect(() => {
    if (storedUser?.role !== 'admin') {
      navigate('/profile', { replace: true });
      return;
    }

    if (hasLoadedDashboard.current) {
      return;
    }

    hasLoadedDashboard.current = true;

    loadDashboard();
  }, []);

  useEffect(() => {
    if (storedUser?.role !== 'admin') return;

    if (activeSection === 'overview') return;

    if (activeSection === 'users' && data.users.length > 0) return;
    if (activeSection === 'loginAttempts' && data.loginAttempts.length > 0) return;
    if (activeSection === 'alerts' && data.alerts.length > 0) return;
    if (activeSection === 'threads' && data.threads.length > 0) return;
    if (activeSection === 'integrity' && data.integrity.length > 0) return;
    if (activeSection === 'ephemeral' && data.ephemeral.length > 0) return;
    if (activeSection === 'systemLogs' && data.systemLogs.length > 0) return;
    if (activeSection === 'audit' && data.audit.length > 0) return;
    if (activeSection === 'devsecops' && data.devsecops) return;

    loadSectionData(activeSection);
  }, [activeSection]);

  async function runUserAction(userId: string, action: string) {
    if (action === 'disable' && !window.confirm('Suspend this customer account?')) return;
    if (action === 'enable' && !window.confirm('Activate this customer account?')) return;

    try {
      await api.post(`/api/admin/users/${userId}/${action}`, { reason: `Admin dashboard ${action}` });
      await refreshUsers();
      setStatus({ type: 'success', message: 'Customer account status updated.' });
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Customer account action failed.' });
    }
  }

  async function viewLoginHistory(userId: string) {
    try {
      const response = await api.get(`/api/admin/users/${userId}/login-history`);
      setLoginHistory(response.data.logs || []);
      setActiveSection('users');
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Could not load login history.' });
    }
  }

  async function updateAlert(alertId: string, action: string) {
    try {
      if (action === 'note') {
        const adminNotes = window.prompt('Admin note for this alert:');
        if (adminNotes === null) return;
        await api.patch(`/api/admin/alerts/${alertId}/note`, { adminNotes });
      } else if (action === 'disable-user') {
        if (!window.confirm('Suspend the customer related to this alert?')) return;
        await api.post(`/api/admin/alerts/${alertId}/disable-user`);
      } else {
        await api.patch(`/api/admin/alerts/${alertId}/status`, { status: action });
      }
      await refreshAlerts();
      setStatus({ type: 'success', message: 'Alert updated.' });
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Alert action failed.' });
    }
  }

  function renderOverview() {
    const summary = data.overview.summary || {};
    const cards = [
      ['Total customers', summary.totalCustomers],
      ['Active customers', summary.activeCustomers],
      ['Active direct chats', summary.activeDirectChats],
      ['Active group chats', summary.activeGroupChats],
      ['Encrypted messages sent', summary.totalEncryptedMessagesSent],
      ['Failed logins today', summary.failedLoginAttemptsToday],
      ['Suspicious alerts', summary.suspiciousActivityAlerts],
      ['Integrity failures', summary.messageIntegrityFailures],
      ['Ephemeral pending deletion', summary.ephemeralMessagesPendingDeletion],
      ['CI/CD security scan', summary.latestCiCdSecurityScanStatus],
    ];

    return (
      <>
        <div className="admin-card-grid">
          {cards.map(([label, value]) => (
            <article className="admin-metric" key={label}>
              <span>{label}</span>
              <strong>{value ?? '—'}</strong>
            </article>
          ))}
        </div>
        <div className="admin-chart-grid">
          <section className="admin-panel"><h3>Login failures</h3><BarChart data={data.overview.charts?.loginFailures || []} /></section>
          <section className="admin-panel"><h3>Accounts by type</h3><BarChart data={data.overview.charts?.activeUsers || []} /></section>
          <section className="admin-panel"><h3>Message volume</h3><BarChart data={data.overview.charts?.messageVolume || []} /></section>
          <section className="admin-panel"><h3>Alerts by severity</h3><BarChart data={data.overview.charts?.alertsBySeverity || []} /></section>
        </div>
      </>
    );
  }

  function renderUsers() {
    return (
      <>
        <div className="admin-toolbar">
          <input value={userSearch} onChange={(event: ChangeEvent<HTMLInputElement>) => setUserSearch(event.target.value)} placeholder="Search customers" />
          <button type="button" className="secondary" onClick={() => refreshUsers()}>Search</button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Customer ID</th><th>Name</th><th>Email</th><th>User type</th><th>2FA</th><th>Status</th><th>Last login</th><th>Failed</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data.users.map((user: any) => (
                <tr key={user.id}>
                  <td>{user.id}</td><td>{user.name}</td><td>{user.email}</td><td><span className={badgeClass(user.role)}>{user.role}</span></td>
                  <td><span className={badgeClass(user.twoFactorStatus)}>{user.twoFactorStatus}</span></td><td><span className={badgeClass(user.accountStatus)}>{user.accountStatus}</span></td>
                  <td>{formatDate(user.lastLoginAt)}</td><td>{user.failedLoginCount}</td><td>{formatDate(user.createdAt)}</td>
                  <td className="admin-actions">
                    <button onClick={() => runUserAction(user.id, 'disable')}>Suspend</button>
                    <button onClick={() => runUserAction(user.id, 'enable')}>Activate</button>
                    <button onClick={() => viewLoginHistory(user.id)}>History</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loginHistory.length > 0 && (
          <section className="admin-panel">
            <h3>Customer login history</h3>
            <div className="admin-table-wrap">
              <table className="admin-table compact">
                <thead><tr><th>Log ID</th><th>Event</th><th>IP</th><th>Time</th><th>Description</th><th>Severity</th></tr></thead>
                <tbody>{loginHistory.map((log) => <tr key={log.id}><td>{log.id}</td><td>{log.eventType}</td><td>{log.ipAddress || '—'}</td><td>{formatDate(log.timestamp)}</td><td>{log.description}</td><td><span className={badgeClass(log.severity)}>{log.severity}</span></td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}
      </>
    );
  }

  function renderLoginAttempts() {
    return <Table rows={data.loginAttempts} columns={['id', 'userEmail', 'ipAddress', 'deviceBrowser', 'loginTime', 'loginStatus', 'failureReason', 'twoFactorStatus', 'riskLevel']} dateKeys={['loginTime']} />;
  }

  function renderAlerts() {
    return (
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Alert ID</th><th>Customer ID</th><th>Activity</th><th>Description</th><th>Risk</th><th>Timestamp</th><th>Status</th><th>Admin notes</th><th>Actions</th></tr></thead>
          <tbody>
            {data.alerts.map((alert: any) => (
              <tr key={alert._id}>
                <td>{alert._id}</td><td>{alert.userId?._id || alert.userId || '—'}</td><td>{alert.activityType}</td><td>{alert.description}</td>
                <td><span className={badgeClass(alert.riskLevel)}>{alert.riskLevel}</span></td><td>{formatDate(alert.createdAt)}</td>
                <td><span className={badgeClass(alert.status)}>{alert.status}</span></td><td>{alert.adminNotes || '—'}</td>
                <td className="admin-actions">
                  <button onClick={() => updateAlert(alert._id, 'investigating')}>Investigating</button>
                  <button onClick={() => updateAlert(alert._id, 'resolved')}>Resolved</button>
                  <button onClick={() => updateAlert(alert._id, 'note')}>Add note</button>
                  <button onClick={() => updateAlert(alert._id, 'disable-user')}>Suspend customer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderSystemLogs() {
    return (
      <>
        <div className="admin-toolbar">
          <input value={systemLogSearch} onChange={(event) => setSystemLogSearch(event.target.value)} placeholder="Search logs" />
          <button type="button" className="secondary" onClick={() => refreshSystemLogs()}>Search</button>
        </div>
        <Table rows={data.systemLogs} columns={['id', 'eventType', 'userId', 'ipAddress', 'timestamp', 'description', 'severity']} dateKeys={['timestamp']} />
      </>
    );
  }

  function renderDevSecOps() {
    const scan = data.devsecops || {};
    return (
      <>
        <div className="admin-card-grid">
          {[
            ['Latest build', scan.buildStatus],
            ['SAST', scan.sastStatus],
            ['DAST', scan.dastStatus],
            ['Dependency scan', scan.dependencyStatus],
            ['Unit tests', scan.unitTestStatus],
            ['Last deployment', formatDate(scan.deployedAt)],
            ['Environment', scan.environment],
            ['Rollback', scan.rollbackStatus],
          ].map(([label, value]) => <article className="admin-metric" key={label}><span>{label}</span><strong>{value || '—'}</strong></article>)}
        </div>
        <Table rows={scan.scanSummaries || []} columns={['tool', 'status', 'summary', 'criticalFindings', 'highFindings']} />
      </>
    );
  }

  function renderActiveSection() {
    if (activeSection === 'overview') return renderOverview();
    if (activeSection === 'users') return renderUsers();
    if (activeSection === 'loginAttempts') return renderLoginAttempts();
    if (activeSection === 'alerts') return renderAlerts();
    if (activeSection === 'threads') return <Table rows={data.threads} columns={['id', 'threadType', 'participantCount', 'createdBy', 'createdAt', 'lastActivityAt', 'messageCount', 'status']} dateKeys={['createdAt', 'lastActivityAt']} />;
    if (activeSection === 'integrity') return <Table rows={data.integrity} columns={['_id', 'messageId', 'threadId', 'senderId', 'hashStatus', 'verificationResult', 'createdAt', 'actionTaken']} dateKeys={['createdAt']} />;
    if (activeSection === 'ephemeral') return <Table rows={data.ephemeral} columns={['_id', 'messageId', 'threadId', 'senderId', 'createdAt', 'expiryAt', 'deletionStatus', 'deletedAt']} dateKeys={['createdAt', 'expiryAt', 'deletedAt']} />;
    if (activeSection === 'systemLogs') return renderSystemLogs();
    if (activeSection === 'audit') return <Table rows={data.audit} columns={['_id', 'adminUserId', 'action', 'targetId', 'createdAt', 'ipAddress', 'result', 'reason']} dateKeys={['createdAt']} />;
    if (activeSection === 'devsecops') return renderDevSecOps();
    return null;
  }

  if (storedUser?.role !== 'admin') return null;

  return (
    <section className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <p className="brand-kicker">Admin SOC</p>
          <h2>Secure Chat Control</h2>
        </div>
        <nav aria-label="Admin dashboard sections">
          {navItems.map(([id, label]) => (
            <button key={id} type="button" className={activeSection === id ? 'active' : ''} onClick={() => setActiveSection(id)}>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <p className="brand-kicker">RBAC Protected</p>
            <h1>{navItems.find(([id]) => id === activeSection)?.[1]}</h1>
            <p>{sectionDescriptions[activeSection]}</p>
          </div>
          <button type="button" className="secondary" onClick={loadDashboard}>Refresh</button>
        </header>

        {status.message && <p className={`status ${status.type}`}>{status.message}</p>}
        {loading ? <p className="status">Loading admin dashboard...</p> : renderActiveSection()}
      </main>
    </section>
  );
}

function Table({ rows, columns, dateKeys = [] }: { rows: any[]; columns: string[]; dateKeys?: string[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length}>No records found.</td></tr>}
          {rows.map((row, rowIndex) => (
            <tr key={row._id || row.id || rowIndex}>
              {columns.map((column) => {
                const value = row[column];
                const displayValue = dateKeys.includes(column) ? formatDate(value) : typeof value === 'object' && value?._id ? value._id : value;
                return <td key={column}>{column.toLowerCase().includes('status') || column === 'severity' || column === 'riskLevel' || column === 'verificationResult' || column === 'result' ? <span className={badgeClass(displayValue)}>{displayValue || '—'}</span> : displayValue || '—'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminDashboardPage;
