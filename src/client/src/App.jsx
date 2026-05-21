import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import AdminDashboardPage from './pages/admin'
import ChatPage from './pages/chat'
import ContactsPage from './pages/contacts'
import CustomerDashboardPage from './pages/dashboard'
import GroupsPage from './pages/groups'
import LoginPage from './pages/login'
import ProfilePage from './pages/profile'
import RegisterPage from './pages/register'
import { createApiClient } from './lib/api'
import { getOrCreateIdentity } from './lib/chatE2ee'
import './App.css'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('secureChatTheme') || 'light')
  const [token, setToken] = useState(() => localStorage.getItem('secureChatToken'))
  const [navOpen, setNavOpen] = useState(false)
  const [groupInviteNotice, setGroupInviteNotice] = useState(null)
  const notificationSocketRef = useRef(null)
  const storedUser = localStorage.getItem('secureChatUser')
  const currentUser = storedUser ? JSON.parse(storedUser) : null
  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('secureChatTheme', theme)
  }, [theme])

  useEffect(() => {
    function handleAuthChanged() {
      setToken(localStorage.getItem('secureChatToken'))
    }

    window.addEventListener('securechat-auth-changed', handleAuthChanged)
    window.addEventListener('storage', handleAuthChanged)

    return () => {
      window.removeEventListener('securechat-auth-changed', handleAuthChanged)
      window.removeEventListener('storage', handleAuthChanged)
    }
  }, [])

  // After login, eagerly generate the user's E2EE identity and publish their
  // public key so other customers can immediately send first-contact requests.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const identity = await getOrCreateIdentity()
        if (cancelled) return
        const latestStoredUser = localStorage.getItem('secureChatUser')
        const latestUser = latestStoredUser ? JSON.parse(latestStoredUser) : null
        const api = createApiClient()
        await api.put('/api/chat/keys/public', {
          publicKey: identity.publicKey,
          keyExchangePublicKey: identity.keyExchangePublicKey,
        })
        if (latestUser) {
          localStorage.setItem('secureChatUser', JSON.stringify({
            ...latestUser,
            publicKey: identity.publicKey,
            keyExchangePublicKey: identity.keyExchangePublicKey,
          }))
        }
      } catch {
        // Non-fatal: chat page will retry on its own bootstrap.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    if (!token || isAdmin) return undefined

    const socketOptions = {
      auth: { token },
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    }
    const socketUrl = import.meta.env.VITE_SOCKET_URL || ''
    const socket = socketUrl ? io(socketUrl, socketOptions) : io(socketOptions)
    notificationSocketRef.current = socket

    socket.on('group:invitation:new', (payload) => {
      const notice = {
        threadId: payload?.threadId || payload?.group?.id || '',
        groupName: payload?.group?.name || 'Encrypted group',
        inviterName: payload?.invitedBy?.username || 'A customer',
        invitedAt: payload?.invitedAt || new Date().toISOString(),
      }
      setGroupInviteNotice(notice)
      window.dispatchEvent(new CustomEvent('securechat-group-invitation', { detail: notice }))
    })

    return () => {
      socket.disconnect()
      if (notificationSocketRef.current === socket) {
        notificationSocketRef.current = null
      }
    }
  }, [token, isAdmin])

  function handleSignOut() {
    localStorage.removeItem('secureChatToken')
    localStorage.removeItem('secureChatUser')
    window.dispatchEvent(new Event('securechat-auth-changed'))
    navigate('/login', { replace: true })
    setNavOpen(false)
  }

  if (token) {
    return (
      <main className={location.pathname.startsWith('/admin') ? 'admin-route-shell' : 'app-shell'}>
        {!location.pathname.startsWith('/admin') && (
          <header className="app-navbar">
            <div className="navbar-inner">
              <div className="app-navbar-brand">
                <img src="/scslogo.png" alt="Shadow Link" className="navbar-logo" />
                <span className="navbar-brand-name">Shadow Link</span>
              </div>
              <nav className={`app-navbar-links${navOpen ? ' open' : ''}`} aria-label="Main navigation">
                {!isAdmin && (
                  <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
                    Dashboard
                  </NavLink>
                )}
                {!isAdmin && (
                  <NavLink to="/contacts" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
                    Contacts
                  </NavLink>
                )}
                {!isAdmin && (
                  <NavLink to="/chat" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
                    Chat
                  </NavLink>
                )}
                {!isAdmin && (
                  <NavLink to="/groups" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
                    Groups
                  </NavLink>
                )}
                <NavLink to="/profile" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
                  Profile
                </NavLink>
                {isAdmin && (
                  <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
                    Admin
                  </NavLink>
                )}
              </nav>
              <div className="app-navbar-end">
                <span className="navbar-user">{currentUser?.username}</span>
                <button type="button" className="sign-out-btn" onClick={handleSignOut}>
                  Sign out
                </button>
                <button
                  type="button"
                  className={`navbar-burger${navOpen ? ' active' : ''}`}
                  aria-label={navOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={navOpen}
                  onClick={() => setNavOpen((v) => !v)}
                >
                  <span /><span /><span />
                </button>
              </div>
            </div>
          </header>
        )}
        {groupInviteNotice && !isAdmin && (
          <div className="group-invite-toast" role="status" aria-live="polite">
            <div>
              <strong>New group invitation</strong>
              <span>{groupInviteNotice.inviterName} invited you to {groupInviteNotice.groupName}.</span>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setGroupInviteNotice(null)
                navigate('/groups')
              }}
            >
              View
            </button>
            <button type="button" className="toast-dismiss" aria-label="Dismiss invitation notice" onClick={() => setGroupInviteNotice(null)}>
              x
            </button>
          </div>
        )}
        <div className="app-page">
          <Routes>
            <Route path="/dashboard" element={isAdmin ? <Navigate to="/admin" replace /> : <CustomerDashboardPage />} />
            <Route path="/contacts" element={isAdmin ? <Navigate to="/admin" replace /> : <ContactsPage />} />
            <Route path="/groups" element={isAdmin ? <Navigate to="/admin" replace /> : <GroupsPage />} />
            <Route path="/profile" element={<ProfilePage onThemeChange={setTheme} />} />
            <Route path="/chat" element={isAdmin ? <Navigate to="/admin" replace /> : <ChatPage />} />
            <Route path="/admin" element={isAdmin ? <AdminDashboardPage /> : <Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />} />
            <Route path="/register" element={<Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />} />
            <Route path="*" element={<Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />} />
          </Routes>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel auth-panel--minimal" aria-label="Authentication panel">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </section>
    </main>
  )
}

export default App
