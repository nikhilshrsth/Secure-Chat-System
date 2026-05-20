import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import AdminDashboardPage from './pages/admin'
import LoginPage from './pages/login'
import ProfilePage from './pages/profile'
import RegisterPage from './pages/register'
import './App.css'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('secureChatTheme') || 'light')
  const [token, setToken] = useState(() => localStorage.getItem('secureChatToken'))
  const isLogin = location.pathname === '/login' || location.pathname === '/'
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

  function handleSignOut() {
    localStorage.removeItem('secureChatToken')
    localStorage.removeItem('secureChatUser')
    window.dispatchEvent(new Event('securechat-auth-changed'))
    navigate('/login', { replace: true })
  }

  if (token) {
    return (
      <main className={location.pathname.startsWith('/admin') ? 'admin-route-shell' : 'profile-shell'}>
        {!location.pathname.startsWith('/admin') && (
          <header className="profile-shell-header">
            <div>
              <p className="brand-kicker">Shadow Link</p>
              <h1>Your workspace profile</h1>
            </div>
            <div className="shell-actions">
              {isAdmin && (
                <NavLink to="/admin" className="secondary">
                  Admin dashboard
                </NavLink>
              )}
              <button type="button" className="secondary" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </header>
        )}
        <Routes>
          <Route path="/profile" element={<ProfilePage onThemeChange={setTheme} />} />
          <Route path="/admin" element={isAdmin ? <AdminDashboardPage /> : <Navigate to="/profile" replace />} />
          <Route path="/login" element={<Navigate to="/profile" replace />} />
          <Route path="/register" element={<Navigate to="/profile" replace />} />
          <Route path="*" element={<Navigate to="/profile" replace />} />
        </Routes>
      </main>
    )
  }

  return (
    <main className="brand-shell">
      <section className="brand-panel">
        <div className="brand-hero-content">
          <img className="brand-logo" src="/shadow-link-logo.png" alt="Shadow Link" />
          <h1 className="sr-only">Shadow Link</h1>
          <p className="brand-copy">
            Protected messaging for teams that need trusted identity, private conversations,
            and a calm workspace for secure collaboration.
          </p>
          <div className="brand-points" aria-label="Platform highlights">
            <span>End-to-end encrypted</span>
            <span>JWT protected routes</span>
            <span>Role-based access</span>
          </div>
        </div>
      </section>

      <section className="auth-panel" aria-label="Authentication panel">
        <div className="auth-brand">
          <img src="/shadow-link-logo.png" alt="" aria-hidden="true" />
          <div>
            <p>Shadow Link</p>
            <span>Secure access</span>
          </div>
        </div>

        <div className="tab-row" role="tablist" aria-label="Auth mode">
          <NavLink
            to="/login"
            className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
            role="tab"
            aria-selected={isLogin}
          >
            Sign in
          </NavLink>
          <NavLink
            to="/register"
            className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
            role="tab"
            aria-selected={!isLogin}
          >
            Register
          </NavLink>
        </div>

        <div className="auth-head">
          <h2>{isLogin ? 'Sign in to Shadow Link' : 'Create your Shadow Link account'}</h2>
          <p>{isLogin ? 'Use your email and password to continue.' : 'Only a few details are required to get started.'}</p>
        </div>

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
