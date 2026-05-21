import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';

function normalizeProfilePictureUrl(rawUrl?: string | null) {
  if (!rawUrl) return null;

  const value = rawUrl.trim();
  if (!value) return null;

  if (value.startsWith('http://') || value.startsWith('https://')) return value;

  const withoutQuery = value.split('?')[0];

  if (withoutQuery.startsWith('/uploads/profile-pictures/')) return withoutQuery;
  if (withoutQuery.startsWith('uploads/profile-pictures/')) return `/${withoutQuery}`;

  if (withoutQuery.startsWith('/api/profile/picture')) {
    const parts = withoutQuery.split('/').filter(Boolean);
    const fileName = parts[parts.length - 1];
    if (fileName && fileName !== 'picture') return `/uploads/profile-pictures/${fileName}`;
    return null;
  }

  return withoutQuery;
}

/* ─── Static data ──────────────────────────────────────────── */
const countryLabels: Record<string, string> = {
  US: 'United States', CA: 'Canada', GB: 'United Kingdom', AU: 'Australia',
  DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy', NL: 'Netherlands',
  SE: 'Sweden', JP: 'Japan', BR: 'Brazil', IN: 'India', MX: 'Mexico',
  NZ: 'New Zealand', IE: 'Ireland', CH: 'Switzerland', BE: 'Belgium',
  DK: 'Denmark', NO: 'Norway',
};

const languageLabels: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French',
  de: 'German', pt: 'Portuguese', ja: 'Japanese',
};

/* ─── Accordion ─────────────────────────────────────────────── */
type AccordionProps = {
  id: string;
  label: string;
  icon: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
};

function Accordion({ id, label, icon, open, onToggle, children, badge }: AccordionProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`prof-accordion${open ? ' prof-accordion--open' : ''}`}>
      <button
        type="button"
        className="prof-accordion-head"
        aria-expanded={open}
        aria-controls={`acc-${id}`}
        onClick={onToggle}
      >
        <span className="prof-acc-icon">{icon}</span>
        <span className="prof-acc-label">{label}</span>
        {badge && <span className="prof-acc-badge">{badge}</span>}
        <span className="prof-acc-chevron" aria-hidden="true">▾</span>
      </button>
      <div
        id={`acc-${id}`}
        className="prof-accordion-body"
        ref={bodyRef}
        style={open ? { maxHeight: bodyRef.current?.scrollHeight ?? 1200 } : { maxHeight: 0 }}
      >
        <div className="prof-accordion-inner">{children}</div>
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────── */
function ProfilePage({ onThemeChange }: { onThemeChange: (theme: string) => void }) {
  const api = useMemo(() => createApiClient(), []);
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [pictureLoading, setPictureLoading] = useState(false);
  const [mfaSetupLoading, setMfaSetupLoading] = useState(false);
  const [mfaEnableLoading, setMfaEnableLoading] = useState(false);
  const [mfaDisableLoading, setMfaDisableLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [accountUser, setAccountUser] = useState<Record<string, any> | null>(null);
  const [supportedCountries, setSupportedCountries] = useState<string[]>([]);
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);

  const [mfaQrCodeDataUrl, setMfaQrCodeDataUrl] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [formData, setFormData] = useState({
    dateOfBirth: '',
    alternativeEmail: '',
    country: '',
    preferredLanguage: 'en',
    themePreference: 'light',
    phoneNumber: '',
  });

  const [openSection, setOpenSection] = useState<string | null>(null);

  const storedUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/api/profile');
        const { user, profile: p, supportedCountries: sc, supportedLanguages: sl } = res.data;
        const u = user || storedUser || null;
        setAccountUser(u);
        if (u) localStorage.setItem('secureChatUser', JSON.stringify(u));
        setSupportedCountries(sc || []);
        setSupportedLanguages(sl || []);
        if (p) {
          setProfile(p);
          setFormData({
            dateOfBirth: p.dateOfBirth || '',
            alternativeEmail: p.alternativeEmail || '',
            country: p.country || '',
            preferredLanguage: p.preferredLanguage || 'en',
            themePreference: p.themePreference || 'light',
            phoneNumber: p.phoneNumber || '',
          });
          onThemeChange(p.themePreference || 'light');
        } else {
          const saved = localStorage.getItem('secureChatTheme') || 'light';
          onThemeChange(saved);
          setFormData((prev) => ({ ...prev, themePreference: saved }));
        }
      } catch (err: unknown) {
        const e = err as AxiosError<{ message?: string }>;
        setStatus({ type: 'error', message: e.response?.data?.message || 'Unable to load profile.' });
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const requestedSection = (location.state as { openSection?: string } | null)?.openSection;
    if (!requestedSection) return;
    setOpenSection(requestedSection);
  }, [location.state]);

  function toggle(id: string) {
    setOpenSection((prev) => (prev === id ? null : id));
    setStatus({ type: '', message: '' });
  }

  function onChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function updateTheme(value: string) {
    setFormData((prev) => ({ ...prev, themePreference: value }));
    onThemeChange(value);
    localStorage.setItem('secureChatTheme', value);
  }

  async function handlePhoneSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPhoneSaving(true);
    setStatus({ type: '', message: '' });
    try {
      const payload = { phoneNumber: formData.phoneNumber || undefined };
      const res = profile
        ? await api.put('/api/profile', payload)
        : await api.post('/api/profile', { ...payload, themePreference: formData.themePreference });
      setProfile(res.data.profile);
      setStatus({ type: 'success', message: 'Phone number saved.' });
    } catch (err: unknown) {
      const e = err as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: e.response?.data?.message || 'Could not save phone number.' });
    } finally {
      setPhoneSaving(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setStatus({ type: '', message: '' });
    try {
      const payload = {
        dateOfBirth: formData.dateOfBirth || undefined,
        alternativeEmail: formData.alternativeEmail || undefined,
        country: formData.country || undefined,
        preferredLanguage: formData.preferredLanguage || undefined,
        themePreference: formData.themePreference || undefined,
      };
      const res = profile
        ? await api.put('/api/profile', payload)
        : await api.post('/api/profile', payload);
      setProfile(res.data.profile);
      updateTheme(res.data.profile.themePreference || 'light');
      setStatus({ type: 'success', message: 'Profile saved.' });
    } catch (err: unknown) {
      const e = err as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: e.response?.data?.message || 'Could not save profile.' });
    } finally {
      setSaving(false);
    }
  }

  async function uploadPicture(file: File) {
    setPictureLoading(true);
    setStatus({ type: '', message: '' });
    try {
      const form = new FormData();
      form.append('picture', file);
      const res = await api.post('/api/profile/picture', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile(res.data.profile);
      setStatus({ type: 'success', message: 'Picture updated.' });
    } catch (err: unknown) {
      const e = err as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: e.response?.data?.message || 'Upload failed.' });
    } finally {
      setPictureLoading(false);
    }
  }

  async function handlePictureChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { await uploadPicture(file); e.target.value = ''; }
  }

  async function handleRemovePicture() {
    if (!normalizeProfilePictureUrl(profile?.profilePictureUrl)) return;
    setPictureLoading(true);
    setStatus({ type: '', message: '' });
    try {
      const res = await api.delete('/api/profile/picture');
      setProfile(res.data.profile);
      setStatus({ type: 'success', message: 'Picture removed.' });
    } catch (err: unknown) {
      const e = err as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: e.response?.data?.message || 'Could not remove picture.' });
    } finally {
      setPictureLoading(false);
    }
  }

  async function handleGenerateMfaSetup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMfaSetupLoading(true);
    setStatus({ type: '', message: '' });
    try {
      const res = await api.post('/api/auth/mfa/setup');
      setMfaQrCodeDataUrl(res.data?.qrCodeDataUrl || '');
      setMfaSecret(res.data?.secret || '');
    } catch (err: unknown) {
      const e = err as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: e.response?.data?.message || 'Could not start MFA setup.' });
    } finally {
      setMfaSetupLoading(false);
    }
  }

  async function handleEnableMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMfaEnableLoading(true);
    setStatus({ type: '', message: '' });
    try {
      const res = await api.post('/api/auth/mfa/enable', { code: mfaCode });
      const next = res.data?.user || accountUser;
      if (next) {
        setAccountUser(next);
        localStorage.setItem('secureChatUser', JSON.stringify(next));
        window.dispatchEvent(new Event('securechat-auth-changed'));
      }
      setMfaCode(''); setMfaSecret(''); setMfaQrCodeDataUrl('');
      setStatus({ type: 'success', message: 'Authenticator MFA enabled.' });
    } catch (err: unknown) {
      const e = err as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: e.response?.data?.message || 'Could not enable MFA.' });
    } finally {
      setMfaEnableLoading(false);
    }
  }

  async function handleDisableMfa() {
    setMfaDisableLoading(true);
    setStatus({ type: '', message: '' });
    try {
      const res = await api.post('/api/auth/mfa/disable');
      const next = res.data?.user || accountUser;
      if (next) {
        setAccountUser(next);
        localStorage.setItem('secureChatUser', JSON.stringify(next));
        window.dispatchEvent(new Event('securechat-auth-changed'));
      }
      setMfaCode(''); setMfaSecret(''); setMfaQrCodeDataUrl('');
      setStatus({ type: 'success', message: 'Authenticator MFA disabled.' });
    } catch (err: unknown) {
      const e = err as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: e.response?.data?.message || 'Could not disable MFA.' });
    } finally {
      setMfaDisableLoading(false);
    }
  }

  async function handleChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!passwordData.currentPassword || !passwordData.newPassword) {
      setStatus({ type: 'error', message: 'Current and new password are required.' });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setStatus({ type: 'error', message: 'New password must be at least 8 characters.' });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmNewPassword) {
      setStatus({ type: 'error', message: 'New password and confirmation do not match.' });
      return;
    }

    setPasswordSaving(true);
    setStatus({ type: '', message: '' });
    try {
      const res = await api.post('/api/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setPasswordData({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
      setStatus({ type: 'success', message: res.data?.message || 'Password updated successfully.' });
    } catch (err: unknown) {
      const e = err as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: e.response?.data?.message || 'Could not update password.' });
    } finally {
      setPasswordSaving(false);
    }
  }

  const username = accountUser?.username ?? storedUser?.username ?? '—';
  const email    = accountUser?.email    ?? storedUser?.email    ?? '—';
  const mfaOn    = accountUser?.isTwoFactorEnabled ?? false;
  const isAdmin  = (accountUser?.role ?? storedUser?.role) === 'admin';
  const initial  = username.charAt(0).toUpperCase();
  const profilePictureUrl = normalizeProfilePictureUrl(profile?.profilePictureUrl);

  if (loading) return <p className="status">Loading…</p>;

  return (
    <div className="prof-root">
      {/* ── Identity card ── */}
      <div className="prof-identity card">
        <div className="prof-avatar">
          {profilePictureUrl
            ? <img src={profilePictureUrl} alt="Avatar" />
            : <span>{initial}</span>}
        </div>
        <div className="prof-identity-text">
          <strong>{username}</strong>
          <span>{email}</span>
        </div>
        <div className="prof-identity-badges">
          <span className={`badge ${mfaOn ? 'good' : 'warn'}`}>{mfaOn ? 'MFA on' : 'MFA off'}</span>
          {isAdmin && <span className="badge">Admin</span>}
          {profile && <span className="badge">Active</span>}
        </div>
      </div>

      {status.message && (
        <p className={`status ${status.type}`} role="status" aria-live="polite">
          {status.message}
        </p>
      )}

      <div className="prof-accordions">

        {/* ── 1. Profile picture ── */}
        <Accordion id="picture" label="Profile picture" icon="🖼" open={openSection === 'picture'} onToggle={() => toggle('picture')}>
          <div className="prof-picture-row">
            <div className="prof-avatar prof-avatar--lg">
              {profilePictureUrl
                ? <img src={profilePictureUrl} alt="Avatar" />
                : <span>{initial}</span>}
            </div>
            <div className="prof-picture-actions">
              <label className="prof-upload-btn">
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePictureChange} hidden />
                {pictureLoading ? 'Uploading…' : 'Upload photo'}
              </label>
              {profilePictureUrl && (
                <button type="button" className="prof-remove-btn" onClick={handleRemovePicture} disabled={pictureLoading}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <p className="prof-hint">JPG, PNG or WEBP · max 5 MB</p>
        </Accordion>

        {!isAdmin && (
          <>
            {/* ── 2. Personal details ── */}
            <Accordion id="details" label="Personal details" icon="📋" open={openSection === 'details'} onToggle={() => toggle('details')}>
              <form className="prof-form" onSubmit={handleSubmit}>
                <div className="prof-field-grid">
                  <label className="prof-label">
                    Date of birth
                    <input className="prof-input" name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={onChange} />
                  </label>
                  <label className="prof-label">
                    Alternative email
                    <input className="prof-input" type="email" name="alternativeEmail" value={formData.alternativeEmail} onChange={onChange} placeholder="you@example.com" />
                  </label>
                  <label className="prof-label">
                    Country
                    <select className="prof-input" name="country" value={formData.country} onChange={onChange}>
                      <option value="">Select country</option>
                      {supportedCountries.map((c) => (
                        <option key={c} value={c}>{countryLabels[c] ?? c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="prof-label">
                    Language
                    <select className="prof-input" name="preferredLanguage" value={formData.preferredLanguage} onChange={onChange}>
                      {supportedLanguages.map((l) => (
                        <option key={l} value={l}>{languageLabels[l] ?? l}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="submit" className="prof-save-btn" disabled={saving}>
                  {saving ? 'Saving…' : profile ? 'Save changes' : 'Create profile'}
                </button>
              </form>
            </Accordion>

            {/* ── 4. Appearance ── */}
            <Accordion id="appearance" label="Appearance" icon="🎨" open={openSection === 'appearance'} onToggle={() => toggle('appearance')}>
              <div className="prof-theme-row">
                {(['light', 'dark'] as const).map((t) => (
                  <label key={t} className={`prof-theme-option${formData.themePreference === t ? ' prof-theme-option--active' : ''}`}>
                    <input type="radio" name="themePreference" value={t} checked={formData.themePreference === t} onChange={() => updateTheme(t)} hidden />
                    <span className="prof-theme-swatch" data-theme={t} />
                    <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                  </label>
                ))}
              </div>
              <p className="prof-hint">Theme is applied instantly.</p>
            </Accordion>
          </>
        )}

        {/* ── 3. Phone number ── */}
        <Accordion id="phone" label="Phone number" icon="📱" open={openSection === 'phone'} onToggle={() => toggle('phone')}>
          <form className="prof-form" onSubmit={handlePhoneSubmit}>
            <label className="prof-label">
              Phone number
              <input
                className="prof-input"
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={onChange}
                placeholder="+1 555 000 0000"
                autoComplete="tel"
              />
            </label>
            <p className="prof-hint">Include country code, e.g. +1 for US, +44 for UK.</p>
            <button type="submit" className="prof-save-btn" disabled={phoneSaving}>
              {phoneSaving ? 'Saving…' : 'Save phone number'}
            </button>
          </form>
        </Accordion>

        {/* ── 4. Security (MFA) ── */}
        <Accordion
          id="security"
          label="Security"
          icon="🔐"
          open={openSection === 'security'}
          onToggle={() => toggle('security')}
          badge={mfaOn ? 'MFA on' : undefined}
        >
          {mfaOn ? (
            <div className="prof-mfa-row">
              <p className="prof-mfa-desc">Authenticator (TOTP) MFA is active on your account.</p>
              <button type="button" className="prof-remove-btn" onClick={handleDisableMfa} disabled={mfaDisableLoading}>
                {mfaDisableLoading ? 'Disabling…' : 'Disable MFA'}
              </button>
            </div>
          ) : (
            <div className="prof-mfa-setup">
              <p className="prof-mfa-desc">Use Google Authenticator, Authy, or any TOTP app.</p>

              <div className="prof-mfa-step">
                <span className="prof-step-num">1</span>
                <div>
                  <p className="prof-step-title">Generate QR code</p>
                  <form onSubmit={handleGenerateMfaSetup}>
                    <button type="submit" className="prof-save-btn" disabled={mfaSetupLoading}>
                      {mfaSetupLoading ? 'Generating…' : mfaQrCodeDataUrl ? 'Regenerate QR' : 'Generate QR code'}
                    </button>
                  </form>
                </div>
              </div>

              {mfaQrCodeDataUrl && (
                <div className="prof-mfa-step">
                  <span className="prof-step-num">2</span>
                  <div className="prof-mfa-qr-block">
                    <p className="prof-step-title">Scan with your app</p>
                    <img src={mfaQrCodeDataUrl} alt="MFA QR code" className="prof-qr-img" />
                    <label className="prof-label" style={{ marginTop: '0.75rem' }}>
                      Manual key
                      <input className="prof-input" type="text" value={mfaSecret} readOnly />
                    </label>
                  </div>
                </div>
              )}

              <div className="prof-mfa-step">
                <span className="prof-step-num">{mfaQrCodeDataUrl ? '3' : '2'}</span>
                <div style={{ flex: 1 }}>
                  <p className="prof-step-title">Enter code to enable</p>
                  <form className="prof-mfa-confirm" onSubmit={handleEnableMfa}>
                    <input
                      className="prof-input prof-otp-input"
                      type="text"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D+/g, '').slice(0, 6))}
                      placeholder="000000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                    />
                    <button type="submit" className="prof-save-btn" disabled={mfaEnableLoading || !mfaQrCodeDataUrl}>
                      {mfaEnableLoading ? 'Enabling…' : 'Enable MFA'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          <form className="prof-form" onSubmit={handleChangePassword} style={{ marginTop: '1rem' }}>
            <p className="prof-step-title" style={{ marginBottom: '0.25rem' }}>Change password</p>
            <p className="prof-hint" style={{ marginTop: '0' }}>Use a strong password with letters, numbers, and symbols.</p>
            <div className="prof-field-grid">
              <label className="prof-label">
                Current password
                <input
                  className="prof-input"
                  type="password"
                  autoComplete="current-password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData((prev) => ({ ...prev, currentPassword: e.target.value }))}
                  required
                />
              </label>
              <label className="prof-label">
                New password
                <input
                  className="prof-input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))}
                  required
                />
              </label>
              <label className="prof-label" style={{ gridColumn: '1 / -1' }}>
                Confirm new password
                <input
                  className="prof-input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={passwordData.confirmNewPassword}
                  onChange={(e) => setPasswordData((prev) => ({ ...prev, confirmNewPassword: e.target.value }))}
                  required
                />
              </label>
            </div>
            <button type="submit" className="prof-save-btn" disabled={passwordSaving}>
              {passwordSaving ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </Accordion>

      </div>
    </div>
  );
}

export default ProfilePage;
