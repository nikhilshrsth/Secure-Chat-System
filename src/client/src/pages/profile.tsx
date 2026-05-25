import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';
import {
  getOrCreateIdentity,
  wrapIdentityWithPassphrase,
  unwrapIdentityWithPassphrase,
  persistIdentity,
  clearLocalIdentity,
} from '../lib/chatE2ee';

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
function ProfilePage({ onThemeChange, initialSection }: { onThemeChange: (theme: string) => void; initialSection?: string | null }) {
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

  const [openSection, setOpenSection] = useState<string | null>(initialSection ?? null);

  // E2EE key management state
  const [keysBusy, setKeysBusy] = useState<'' | 'backup' | 'restore' | 'reset'>('');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [hasServerBackup, setHasServerBackup] = useState<boolean>(false);
  const [backupUpdatedAt, setBackupUpdatedAt] = useState<string | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState('');

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

  // Sync when the drawer re-opens to a different section without unmounting.
  useEffect(() => {
    if (initialSection !== undefined) setOpenSection(initialSection ?? null);
  }, [initialSection]);

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
      window.dispatchEvent(new CustomEvent('securechat-profile-pic-changed', {
        detail: normalizeProfilePictureUrl(res.data.profile?.profilePictureUrl) || null,
      }));
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
      window.dispatchEvent(new CustomEvent('securechat-profile-pic-changed', { detail: null }));
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

  /* ── E2EE key management ─────────────────────────────────── */
  useEffect(() => {
    if (openSection !== 'encryption') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/chat/keys/backup');
        if (cancelled) return;
        const backup = res.data?.backup;
        setHasServerBackup(Boolean(backup?.ciphertext));
        setBackupUpdatedAt(backup?.updatedAt || null);
      } catch {
        if (!cancelled) setHasServerBackup(false);
      }
    })();
    return () => { cancelled = true; };
  }, [openSection, api]);

  async function handleBackupKeys(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (backupPassphrase.length < 8) {
      setStatus({ type: 'error', message: 'Passphrase must be at least 8 characters.' });
      return;
    }
    if (backupPassphrase !== backupPassphraseConfirm) {
      setStatus({ type: 'error', message: 'Passphrases do not match.' });
      return;
    }
    setKeysBusy('backup');
    setStatus({ type: '', message: '' });
    try {
      const identity = await getOrCreateIdentity();
      if (!identity.keyExchangePublicKey || !identity.keyExchangePrivateKeyJwk
        || Object.keys(identity.keyExchangePrivateKeyJwk).length === 0) {
        throw new Error('This browser does not have the encryption keys for this account. Open the chat page once to publish your keys, then try again.');
      }

      // Verify the local identity matches the server-registered keys *before*
      // uploading a backup. Backing up keys that the server never accepted
      // (because another browser had already published a different pair)
      // produces a backup that is useless on restore — every "decrypt thread
      // key" attempt will keep failing with an ECDH operation error.
      const meResp = await api.get('/api/chat/keys/public/me');
      const serverPublic: string | null = meResp.data?.publicKey || null;
      const serverEcdh: string | null = meResp.data?.keyExchangePublicKey || null;
      if (serverPublic && serverPublic !== identity.publicKey) {
        throw new Error(
          'This browser\'s encryption keys do not match the keys registered on the server for your account. '
          + 'Backing up these keys would produce a useless backup. Sign in from the browser that originally '
          + 'activated secure chat (or restore a valid backup) and create the backup from there.',
        );
      }
      if (serverEcdh && serverEcdh !== identity.keyExchangePublicKey) {
        throw new Error(
          'This browser\'s key-exchange key does not match the key-exchange key registered on the server. '
          + 'Backing up now would produce a useless backup. Use the original browser, restore a valid backup, '
          + 'or reset the account chat key (you will lose access to existing encrypted threads).',
        );
      }

      const blob = await wrapIdentityWithPassphrase(identity, backupPassphrase);
      await api.put('/api/chat/keys/backup', blob);
      setHasServerBackup(true);
      setBackupUpdatedAt(new Date().toISOString());
      setBackupPassphrase('');
      setBackupPassphraseConfirm('');
      setStatus({ type: 'success', message: 'Encrypted key backup uploaded. Keep your passphrase safe — we cannot recover it.' });
    } catch (err: unknown) {
      const e = err as Error & { response?: { data?: { message?: string } } };
      setStatus({ type: 'error', message: e.response?.data?.message || e.message || 'Could not back up keys.' });
    } finally {
      setKeysBusy('');
    }
  }

  async function handleRestoreKeys(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!restorePassphrase) {
      setStatus({ type: 'error', message: 'Enter your backup passphrase.' });
      return;
    }
    setKeysBusy('restore');
    setStatus({ type: '', message: '' });
    try {
      const res = await api.get('/api/chat/keys/backup');
      const backup = res.data?.backup;
      if (!backup?.ciphertext) {
        throw new Error('No encrypted backup found on the server.');
      }
      const identity = await unwrapIdentityWithPassphrase(backup, restorePassphrase);

      // Verify the restored identity actually matches what the server has on
      // file for this account. If a backup was uploaded from a browser whose
      // keys never won the publish race, restoring it just reinstates the
      // wrong keys and the "operation-specific reason" ECDH error keeps
      // coming back. Detect that here instead of silently overwriting the
      // working local identity (if any).
      const meResp = await api.get('/api/chat/keys/public/me');
      const serverPublic: string | null = meResp.data?.publicKey || null;
      const serverEcdh: string | null = meResp.data?.keyExchangePublicKey || null;
      if (serverPublic && serverPublic !== identity.publicKey) {
        throw new Error(
          'The restored backup does not match the encryption keys the server has registered for your account. '
          + 'This backup was likely created from a different browser whose keys were never accepted by the server. '
          + 'Use the browser that originally activated secure chat to create a fresh backup, or reset the account '
          + 'chat key (you will lose access to existing encrypted threads).',
        );
      }
      if (serverEcdh && serverEcdh !== identity.keyExchangePublicKey) {
        throw new Error(
          'The restored backup\'s key-exchange key does not match the one registered on the server. '
          + 'This backup is from the wrong browser/device. Create a backup from the device that originally '
          + 'activated secure chat, or reset the account chat key.',
        );
      }

      persistIdentity(identity);
      const latestStoredUser = localStorage.getItem('secureChatUser');
      const latestUser = latestStoredUser ? JSON.parse(latestStoredUser) : null;
      if (latestUser) {
        localStorage.setItem('secureChatUser', JSON.stringify({
          ...latestUser,
          publicKey: identity.publicKey,
          keyExchangePublicKey: identity.keyExchangePublicKey,
        }));
      }
      setRestorePassphrase('');
      setStatus({ type: 'success', message: 'Keys restored on this device. Reload the chat to access your encrypted threads.' });
    } catch (err: unknown) {
      const e = err as Error & { response?: { data?: { message?: string } } };
      setStatus({ type: 'error', message: e.response?.data?.message || e.message || 'Could not restore keys.' });
    } finally {
      setKeysBusy('');
    }
  }

  async function handleResetKeys() {
    if (resetConfirmText.trim() !== 'RESET') {
      setStatus({ type: 'error', message: 'Type RESET to confirm key reset.' });
      return;
    }
    setKeysBusy('reset');
    setStatus({ type: '', message: '' });
    try {
      // purgeChats=true so the server also wipes the user's direct threads,
      // their messages, and their chat requests. Without that, after reset
      // the thread list keeps showing broken (undecryptable) old threads
      // and the user cannot start fresh "smoothly".
      await api.delete('/api/chat/keys/public', { params: { purgeChats: 'true' } });
      clearLocalIdentity();

      // Strip the cached publicKey / keyExchangePublicKey from the locally
      // stored user record. The chat page's bootstrap reads this to detect
      // mismatches; if we leave the old keys here, the very next page load
      // will compare them against a freshly generated identity and falsely
      // re-trigger the recovery banner.
      try {
        const raw = localStorage.getItem('secureChatUser');
        if (raw) {
          const parsed = JSON.parse(raw);
          delete parsed.publicKey;
          delete parsed.keyExchangePublicKey;
          localStorage.setItem('secureChatUser', JSON.stringify(parsed));
        }
      } catch { /* non-fatal */ }

      setHasServerBackup(false);
      setBackupUpdatedAt(null);
      setResetConfirmText('');
      setStatus({
        type: 'success',
        message: 'E2EE keys reset and old encrypted chats purged. Reload the page to publish a fresh key and start clean.',
      });
    } catch (err: unknown) {
      const e = err as Error & { response?: { data?: { message?: string } } };
      setStatus({ type: 'error', message: e.response?.data?.message || e.message || 'Could not reset keys.' });
    } finally {
      setKeysBusy('');
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

        {/* ── 5. Encryption keys (E2EE backup / restore / reset) ── */}
        <Accordion
          id="encryption"
          label="Encryption keys"
          icon="🔑"
          open={openSection === 'encryption'}
          onToggle={() => toggle('encryption')}
          badge={hasServerBackup ? 'Backed up' : undefined}
        >
          <p className="prof-hint" style={{ marginTop: 0 }}>
            Your private keys live only on this device. To sign in on another device without
            losing your encrypted chats, upload a <strong>passphrase-protected backup</strong>.
            We never see your passphrase — only encrypted blob and KDF parameters travel to the server.
          </p>

          <form className="prof-form" onSubmit={handleBackupKeys}>
            <p className="prof-step-title" style={{ marginBottom: '0.25rem' }}>Back up keys to server</p>
            {hasServerBackup && backupUpdatedAt && (
              <p className="prof-hint" style={{ marginTop: 0 }}>
                Existing backup uploaded {new Date(backupUpdatedAt).toLocaleString()}. Uploading a new one replaces it.
              </p>
            )}
            <div className="prof-field-grid">
              <label className="prof-label">
                Backup passphrase
                <input
                  className="prof-input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={backupPassphrase}
                  onChange={(e) => setBackupPassphrase(e.target.value)}
                  required
                />
              </label>
              <label className="prof-label">
                Confirm passphrase
                <input
                  className="prof-input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={backupPassphraseConfirm}
                  onChange={(e) => setBackupPassphraseConfirm(e.target.value)}
                  required
                />
              </label>
            </div>
            <p className="prof-hint" style={{ marginTop: '0.25rem' }}>
              Use at least 8 characters. <strong>If you forget it, your backup is unrecoverable.</strong>
            </p>
            <button type="submit" className="prof-save-btn" disabled={keysBusy === 'backup'}>
              {keysBusy === 'backup' ? 'Encrypting…' : hasServerBackup ? 'Replace backup' : 'Create backup'}
            </button>
          </form>

          {hasServerBackup && (
            <form className="prof-form" onSubmit={handleRestoreKeys} style={{ marginTop: '1rem' }}>
              <p className="prof-step-title" style={{ marginBottom: '0.25rem' }}>Restore keys on this device</p>
              <p className="prof-hint" style={{ marginTop: 0 }}>
                Decrypts the backup and replaces this device's key material. Use when you've signed in fresh
                and your existing threads show "Failed to decrypt".
              </p>
              <label className="prof-label">
                Backup passphrase
                <input
                  className="prof-input"
                  type="password"
                  autoComplete="current-password"
                  value={restorePassphrase}
                  onChange={(e) => setRestorePassphrase(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="prof-save-btn" disabled={keysBusy === 'restore'}>
                {keysBusy === 'restore' ? 'Restoring…' : 'Restore keys'}
              </button>
            </form>
          )}

          <div className="prof-form" style={{ marginTop: '1rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
            <p className="prof-step-title" style={{ color: 'var(--danger)', marginBottom: '0.25rem' }}>
              Danger zone — reset E2EE keys
            </p>
            <p className="prof-hint" style={{ marginTop: 0 }}>
              Erases your keys on the server AND this device. <strong>All existing chat threads will become
              permanently unreadable</strong>, even for the other participants. Only use this if your keys are
              compromised. Type <code>RESET</code> below to confirm.
            </p>
            <label className="prof-label">
              Confirmation
              <input
                className="prof-input"
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="Type RESET"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="prof-remove-btn"
              onClick={handleResetKeys}
              disabled={keysBusy === 'reset' || resetConfirmText.trim() !== 'RESET'}
            >
              {keysBusy === 'reset' ? 'Resetting…' : 'Reset encryption keys'}
            </button>
          </div>
        </Accordion>

      </div>
    </div>
  );
}

export default ProfilePage;
