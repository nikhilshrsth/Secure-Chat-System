import { useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import LoginPage from './pages/login'
import ProfilePage from './pages/profile'
import RegisterPage from './pages/register'
import './App.css'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('secureChatTheme') || 'light')
  const token = useMemo(() => localStorage.getItem('secureChatToken'), [])
  const isLogin = location.pathname === '/login' || location.pathname === '/'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('secureChatTheme', theme)
  }, [theme])

  function handleSignOut() {
    localStorage.removeItem('secureChatToken')
    localStorage.removeItem('secureChatUser')
    navigate('/login', { replace: true })
  }

  if (token) {
    return (
      <main className="profile-shell">
        <header className="profile-shell-header">
          <div>
            <p className="brand-kicker">Secure Chat</p>
            <h1>Your workspace profile</h1>
          </div>
          <button type="button" className="secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </header>
        <Routes>
          <Route path="/profile" element={<ProfilePage onThemeChange={setTheme} />} />
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
        <p className="brand-kicker">Secure Chat</p>
        <h1>Secure conversations. Clean workflow.</h1>
        <p className="brand-copy">
          Private messaging for teams with strong identity checks and role-based access.
          Sign in to continue or create a new account.
        </p>
        <div className="brand-points" aria-label="Platform highlights">
          <span>End-to-end encrypted</span>
          <span>JWT protected routes</span>
          <span>Role-based access</span>
        </div>
      </section>

      <section className="auth-panel" aria-label="Authentication panel">
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
          <h2>{isLogin ? 'Sign in to your workspace' : 'Create your secure account'}</h2>
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
