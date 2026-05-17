
import { useState, type ChangeEvent, type FormEvent } from 'react';
import axios, { type AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';

function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

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
      await axios.post('/api/auth/register', {
        username: formData.fullName,
        email: formData.email,
        password: formData.password,
      });
      setOtpSent(true);
      setSuccess('A confirmation code has been sent to your email. Enter the code to complete registration.');
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function onOtpSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOtpLoading(true);
    setError('');
    setSuccess('');
    try {
      await axios.post('/api/auth/verify-email', {
        email: formData.email,
        otp,
      });
      setSuccess('Email verified! Redirecting to login...');
      setTimeout(() => {
        navigate('/login', { replace: true, state: { successMessage: 'Account created. Sign in to continue.' } });
      }, 1200);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message || 'OTP verification failed. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  }


  return (
    <div className="auth-form-wrapper">
      {!otpSent ? (
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Full Name
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={onChange}
              placeholder="Alex Rivera"
              minLength={2}
              maxLength={60}
              autoComplete="name"
              required
            />
          </label>
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
              placeholder="At least 8 characters"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>
          <button type="submit" className="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={onOtpSubmit}>
          <label>
            Enter the code sent to your email
            <input
              type="text"
              name="otp"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D+/g, '').slice(0, 10))}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </label>
          <button type="submit" className="submit" disabled={otpLoading}>
            {otpLoading ? 'Verifying...' : 'Verify & Complete Registration'}
          </button>
        </form>
      )}
      {error && <p className="status error" role="alert">{error}</p>}
      {success && <p className="status success" role="status">{success}</p>}
    </div>
  );
}

export default RegisterPage;
