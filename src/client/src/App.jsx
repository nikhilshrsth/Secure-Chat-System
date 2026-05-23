import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import AdminDashboardPage from './pages/admin'
import ChatPage from './pages/chat'
import FriendsPage from './pages/friends'
import CustomerDashboardPage from './pages/dashboard'
import GroupsPage from './pages/groups'
import LoginPage from './pages/login'
import NotificationsPage from './pages/notifications'
import ProfilePage from './pages/profile'
import RegisterPage from './pages/register'
import { createApiClient } from './lib/api'
import { getOrCreateIdentity } from './lib/chatE2ee'
import './App.css'
import Footer from "./components/Footer"

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('secureChatTheme') || 'light')
  const [token, setToken] = useState(() => localStorage.getItem('secureChatToken'))
  const [navOpen, setNavOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileSection, setProfileSection] = useState(null)
  const [profilePicUrl, setProfilePicUrl] = useState(null)
  const [groupInviteCount, setGroupInviteCount] = useState(0)
  const [notificationCount, setNotificationCount] = useState(0)
  const notificationSocketRef = useRef(null)
  const locationRef = useRef(location)
  const userMenuRef = useRef(null)
  const storedUser = localStorage.getItem('secureChatUser')
  const currentUser = storedUser ? JSON.parse(storedUser) : null
  const isAdmin = currentUser?.role === 'admin'

  // Keep locationRef current so socket callbacks have access without stale closures.
  useEffect(() => { locationRef.current = location }, [location])

  // Close user-menu dropdown on outside click.
  useEffect(() => {
    function onClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const refreshNotificationCount = useCallback(async () => {
    if (!token || isAdmin) {
      setNotificationCount(0)
      return
    }

    try {
      const api = createApiClient()
      const response = await api.get('/api/chat/notifications/unread-count')
      setNotificationCount(Number(response.data?.unreadCount || 0))
    } catch {
      // Non-fatal: realtime events and route visits will retry.
    }
  }, [token, isAdmin])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshNotificationCount()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshNotificationCount, location.pathname])

  useEffect(() => {
    function handleNotificationsChanged() {
      refreshNotificationCount()
    }

    window.addEventListener('securechat-notifications-changed', handleNotificationsChanged)
    return () => window.removeEventListener('securechat-notifications-changed', handleNotificationsChanged)
  }, [refreshNotificationCount])

  // Reset temporary invitation toast on navigation to places that review group notices.
  useEffect(() => {
    if (location.pathname.startsWith('/notifications') || location.pathname.startsWith('/groups')) {
      const timer = window.setTimeout(() => setGroupInviteCount(0), 0)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [location.pathname])

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

  // Fetch the user's profile picture URL whenever they log in/out.
  useEffect(() => {
    if (!token) {
      const timer = window.setTimeout(() => setProfilePicUrl(null), 0)
      return () => window.clearTimeout(timer)
    }
    const api = createApiClient()
    api.get('/api/profile').then(res => {
      const raw = res.data?.profile?.profilePictureUrl || null
      setProfilePicUrl(raw)
    }).catch(() => {})
    return undefined
  }, [token])

  // Sync profile picture updates that happen on the Profile page.
  useEffect(() => {
    function onPicChanged(e) { setProfilePicUrl(e.detail || null) }
    window.addEventListener('securechat-profile-pic-changed', onPicChanged)
    return () => window.removeEventListener('securechat-profile-pic-changed', onPicChanged)
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
        inviterName: payload?.invitedBy?.username || 'A user',
        invitedAt: payload?.invitedAt || new Date().toISOString(),
      }
      setGroupInviteCount((prev) => prev + 1)
      refreshNotificationCount()
      window.dispatchEvent(new CustomEvent('securechat-group-invitation', { detail: notice }))
    })

    socket.on('chat:request:new', () => {
      refreshNotificationCount()
      window.dispatchEvent(new Event('securechat-notifications-changed'))
    })

    socket.on('chat:message:new', (payload) => {
      if (String(payload?.message?.senderId || '') !== String(currentUser?.id || '')) {
        refreshNotificationCount()
      }
    })

    socket.on('notifications:changed', () => {
      refreshNotificationCount()
      window.dispatchEvent(new Event('securechat-notifications-changed'))
    })

    return () => {
      socket.disconnect()
      if (notificationSocketRef.current === socket) {
        notificationSocketRef.current = null
      }
    }
  }, [token, isAdmin, currentUser?.id, refreshNotificationCount])

  function handleSignOut() {
    localStorage.removeItem('secureChatToken')
    localStorage.removeItem('secureChatUser')
    window.dispatchEvent(new Event('securechat-auth-changed'))
    navigate('/login', { replace: true })
    setNavOpen(false)
    setUserMenuOpen(false)
  }

  function openProfileAt(section) {
    setProfileSection(section)
    setProfileOpen(true)
    setUserMenuOpen(false)
    setNavOpen(false)
  }

  if (token) {
    return (
      <main className={location.pathname.startsWith('/admin') ? 'admin-route-shell' : 'app-shell'}>
        {!location.pathname.startsWith('/admin') && (
          <header className="app-navbar">
            <div className="navbar-inner">
              <NavLink to="/chat" className="app-navbar-brand" onClick={() => setNavOpen(false)}>
                <img src="/scslogo.png" alt="Shadow Link" className="navbar-logo" />
                <span className="navbar-brand-name">Shadow Link</span>
              </NavLink>
              <nav className={`app-navbar-links${navOpen ? ' open' : ''}`} aria-label="Main navigation">
                {!isAdmin && (
                  <NavLink to="/friends" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
                    Friends
                  </NavLink>
                )}
                {!isAdmin && (
                  <NavLink to="/groups" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
                    Groups
                  </NavLink>
                )}
                {!isAdmin && (
                  <NavLink to="/chat" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
                    Chat
                  </NavLink>
                )}
                {isAdmin && (
                  <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setNavOpen(false)}>
                    Admin
                  </NavLink>
                )}
              </nav>
              <div className="app-navbar-end">
                {!isAdmin && (
                  <NavLink
                    to="/notifications"
                    className={({ isActive }) => isActive ? 'navbar-icon-btn active' : 'navbar-icon-btn'}
                    aria-label={`Notifications${notificationCount > 0 ? `, ${notificationCount} unread` : ''}`}
                    onClick={() => {
                      setNavOpen(false)
                      setGroupInviteCount(0)
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {notificationCount > 0 && (
                      <span className="nav-badge nav-badge--floating">
                        {notificationCount > 99 ? '99+' : notificationCount}
                      </span>
                    )}
                  </NavLink>
                )}
                <div className="user-menu-wrap" ref={userMenuRef}>
                  <button
                    type="button"
                    className={`user-menu-btn${userMenuOpen ? ' open' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                    aria-label="User menu"
                    onClick={() => setUserMenuOpen((v) => !v)}
                  >
                    <span className="user-menu-avatar">
                      {profilePicUrl
                        ? <img src={profilePicUrl} alt="" className="user-menu-avatar-img" />
                        : (currentUser?.username?.[0]?.toUpperCase() || '?')
                      }
                    </span>
                    <svg
                      className="user-menu-chevron"
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      focusable="false"
                    >
                      <path
                        d="M5.5 7.5 10 12l4.5-4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </button>
                  {userMenuOpen && (
                    <div className="user-menu-dropdown" role="menu" aria-label="User menu">
                      <div className="user-menu-header">
                        <div className="user-menu-header-avatar">
                          {profilePicUrl
                            ? <img src={profilePicUrl} alt="" className="user-menu-avatar-img" />
                            : (currentUser?.username?.[0]?.toUpperCase() || '?')
                          }
                        </div>
                        <div className="user-menu-header-info">
                          <span className="user-menu-header-name">{currentUser?.username}</span>
                          <span className="user-menu-header-email">{currentUser?.email}</span>
                        </div>
                      </div>
                      <div className="user-menu-divider" />
                      <button type="button" className="user-menu-item" role="menuitem" onClick={() => openProfileAt('picture')}>
                        <span aria-hidden="true" className="user-menu-icon">🖼</span>
                        Profile picture
                      </button>
                      {!isAdmin && (
                        <button type="button" className="user-menu-item" role="menuitem" onClick={() => openProfileAt('details')}>
                          <span aria-hidden="true" className="user-menu-icon">📋</span>
                          Personal details
                        </button>
                      )}
                      {!isAdmin && (
                        <button type="button" className="user-menu-item" role="menuitem" onClick={() => openProfileAt('appearance')}>
                          <span aria-hidden="true" className="user-menu-icon">🎨</span>
                          Appearance
                        </button>
                      )}
                      <button type="button" className="user-menu-item" role="menuitem" onClick={() => openProfileAt('phone')}>
                        <span aria-hidden="true" className="user-menu-icon">📱</span>
                        Phone number
                      </button>
                      <button type="button" className="user-menu-item" role="menuitem" onClick={() => openProfileAt('security')}>
                        <span aria-hidden="true" className="user-menu-icon">🔐</span>
                        Security &amp; Password
                      </button>
                      <div className="user-menu-divider" />
                      <button
                        type="button"
                        className="user-menu-item user-menu-item--danger"
                        role="menuitem"
                        onClick={handleSignOut}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
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
        {groupInviteCount > 0 && !isAdmin && (
          <div className="group-invite-toast" role="status" aria-live="polite">
            <div>
              <strong>New group invitation</strong>
              <span>You have {groupInviteCount} pending group invitation{groupInviteCount !== 1 ? 's' : ''}.</span>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setGroupInviteCount(0)
                navigate('/notifications')
              }}
            >
              View
            </button>
            <button type="button" className="toast-dismiss" aria-label="Dismiss invitation notice" onClick={() => setGroupInviteCount(0)}>
              x
            </button>
          </div>
        )}
        {profileOpen && (
          <>
            <div
              className="profile-drawer-overlay"
              onClick={() => setProfileOpen(false)}
              aria-hidden="true"
            />
            <aside
              className="profile-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Profile & Settings"
            >
              <div className="profile-drawer-head">
                <span className="profile-drawer-title">Profile &amp; Settings</span>
                <button
                  type="button"
                  className="profile-drawer-close"
                  aria-label="Close profile settings"
                  onClick={() => setProfileOpen(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="profile-drawer-body">
                <ProfilePage onThemeChange={setTheme} initialSection={profileSection} />
              </div>
            </aside>
          </>
        )}
        <div className="app-page">
          <Routes>
            <Route path="/dashboard" element={isAdmin ? <Navigate to="/admin" replace /> : <CustomerDashboardPage />} />
            <Route path="/friends" element={isAdmin ? <Navigate to="/admin" replace /> : <FriendsPage />} />
            <Route path="/groups" element={isAdmin ? <Navigate to="/admin" replace /> : <GroupsPage />} />
            <Route path="/notifications" element={isAdmin ? <Navigate to="/admin" replace /> : <NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage onThemeChange={setTheme} />} />
            <Route path="/chat" element={isAdmin ? <Navigate to="/admin" replace /> : <ChatPage />} />
            <Route path="/admin" element={isAdmin ? <AdminDashboardPage /> : <Navigate to="/chat" replace />} />
            <Route path="/login" element={<Navigate to={isAdmin ? '/admin' : '/chat'} replace />} />
            <Route path="/register" element={<Navigate to={isAdmin ? '/admin' : '/chat'} replace />} />
            <Route path="*" element={<Navigate to={isAdmin ? '/admin' : '/chat'} replace />} />
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
