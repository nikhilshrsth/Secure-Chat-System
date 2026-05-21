
import { useState, type ChangeEvent, type FormEvent } from 'react';
import axios, { type AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { useLocation, useNavigate } from 'react-router-dom';

function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'forgot-request' | 'forgot-confirm'>('login');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(location.state?.successMessage || '');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetRequestLoading, setResetRequestLoading] = useState(false);
  const [resetConfirmLoading, setResetConfirmLoading] = useState(false);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
    setSuccess('');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await axios.post('/api/auth/login', formData);
      if (response.data?.mfaRequired && response.data?.mfaToken) {
        setMfaToken(response.data.mfaToken);
        setSuccess(response.data.message || 'Enter the authenticator code to continue.');
        return;
      }
      if (response.data?.token && response.data?.user) {
        localStorage.setItem('secureChatToken', response.data.token);
        localStorage.setItem('secureChatUser', JSON.stringify(response.data.user));
        window.dispatchEvent(new Event('securechat-auth-changed'));
        setSuccess(`Welcome back, ${response.data.user.username}. Redirecting...`);
        setTimeout(() => {
          navigate('/profile', { replace: true });
        }, 1200);
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMfaLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await axios.post('/api/auth/mfa/verify-login', {
        mfaToken,
        code: mfaCode,
      });
      if (response.data?.token && response.data?.user) {
        localStorage.setItem('secureChatToken', response.data.token);
        localStorage.setItem('secureChatUser', JSON.stringify(response.data.user));
        window.dispatchEvent(new Event('securechat-auth-changed'));
        setSuccess(`Welcome back, ${response.data.user.username}. Redirecting...`);
        setTimeout(() => {
          navigate('/profile', { replace: true });
        }, 1200);
      } else {
        setError('MFA verification failed.');
      }
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'MFA verification failed.');
    } finally {
      setMfaLoading(false);
    }
  }

  async function requestPasswordReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetRequestLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await axios.post('/api/auth/forgot-password/request', { email: resetEmail });
      setMode('forgot-confirm');
      setSuccess(response.data?.message || 'If the account exists, a reset code has been sent.');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'Could not send reset code.');
    } finally {
      setResetRequestLoading(false);
    }
  }

  async function confirmPasswordReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetConfirmLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await axios.post('/api/auth/forgot-password/confirm', {
        email: resetEmail,
        otp: resetOtp,
        newPassword: resetNewPassword,
      });
      setMode('login');
      setResetOtp('');
      setResetNewPassword('');
      setFormData((prev) => ({ ...prev, email: resetEmail }));
      setSuccess(response.data?.message || 'Password reset successful. Please sign in.');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'Could not reset password.');
    } finally {
      setResetConfirmLoading(false);
    }
  }


  return (
    <div className="auth-form-wrapper">
      <div className="auth-logo-wrap">
        <img src="/scslogo.png" alt="SCS" className="auth-logo" />
      </div>
      <div className="auth-page-head">
        <h1>{mode === 'login' ? 'Sign in' : mode === 'forgot-request' ? 'Reset password' : 'Verify reset code'}</h1>
        <p>{mode === 'login' ? 'Access Shadow Link securely.' : 'Use email OTP verification to continue.'}</p>
      </div>

      {!mfaToken && mode === 'login' ? (
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={onChange}
              placeholder="name@company.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={onChange}
              placeholder="Enter your password"
              minLength={8}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          <button type="button" className="auth-text-btn" onClick={() => { setMode('forgot-request'); setError(''); setSuccess(''); setMfaToken(''); }}>
            Forgot password?
          </button>
        </form>
      ) : !mfaToken && mode === 'forgot-request' ? (
        <form className="auth-form" onSubmit={requestPasswordReset}>
          <label>
            Email
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
            />
          </label>
          <button type="submit" className="submit" disabled={resetRequestLoading}>
            {resetRequestLoading ? 'Sending...' : 'Send reset code'}
          </button>
          <button type="button" className="auth-text-btn" onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>
            Back to sign in
          </button>
        </form>
      ) : !mfaToken ? (
        <form className="auth-form" onSubmit={confirmPasswordReset}>
          <label>
            Email
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            OTP code
            <input
              type="text"
              value={resetOtp}
              onChange={(e) => setResetOtp(e.target.value.replace(/\D+/g, '').slice(0, 10))}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={resetNewPassword}
              onChange={(e) => setResetNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button type="submit" className="submit" disabled={resetConfirmLoading}>
            {resetConfirmLoading ? 'Resetting...' : 'Reset password'}
          </button>
          <button type="button" className="auth-text-btn" onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>
            Back to sign in
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={verifyMfa}>
          <label>
            Authenticator code
            <input
              type="text"
              name="mfaCode"
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value.replace(/\D+/g, '').slice(0, 10))}
              placeholder="Enter code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </label>
          <button type="submit" className="submit" disabled={mfaLoading}>
            {mfaLoading ? 'Verifying...' : 'Complete sign in'}
          </button>
        </form>
      )}
      {!mfaToken && (
        <p className="auth-switch">
          New here? <Link to="/register">Create account</Link>
        </p>
      )}
      {error && <p className="status error" role="alert">{error}</p>}
      {success && <p className="status success" role="status">{success}</p>}
    </div>
  );
}

export default LoginPage;
