
import { useState, type ChangeEvent, type FormEvent } from 'react';
import axios, { type AxiosError } from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';

function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
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


  return (
    <div className="auth-form-wrapper">
      {!mfaToken ? (
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
      {error && <p className="status error" role="alert">{error}</p>}
      {success && <p className="status success" role="status">{success}</p>}
    </div>
  );
}

export default LoginPage;
