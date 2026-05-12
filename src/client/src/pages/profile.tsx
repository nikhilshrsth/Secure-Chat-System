import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios, { type AxiosError } from 'axios';
import { createApiClient } from '../lib/api';

const countryLabels: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  SE: 'Sweden',
  JP: 'Japan',
  BR: 'Brazil',
  IN: 'India',
  MX: 'Mexico',
  NZ: 'New Zealand',
  IE: 'Ireland',
  CH: 'Switzerland',
  BE: 'Belgium',
  DK: 'Denmark',
  NO: 'Norway',
};

const languageLabels: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ja: 'Japanese',
};

function ProfilePage({ onThemeChange }: { onThemeChange: (theme: string) => void }) {
  const navigate = useNavigate();
  const api = useMemo(() => createApiClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pictureLoading, setPictureLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [supportedCountries, setSupportedCountries] = useState<string[]>([]);
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    dateOfBirth: '',
    alternativeEmail: '',
    country: '',
    preferredLanguage: 'en',
    themePreference: 'light',
  });
  const storedUser = useMemo(() => {
    const raw = localStorage.getItem('secureChatUser');
    return raw ? JSON.parse(raw) : null;
  }, []);

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await api.get('/api/profile');
        const data = response.data;
        setSupportedCountries(data.supportedCountries || []);
        setSupportedLanguages(data.supportedLanguages || []);
        if (data.profile) {
          setProfile(data.profile);
          setFormData({
            dateOfBirth: data.profile.dateOfBirth || '',
            alternativeEmail: data.profile.alternativeEmail || '',
            country: data.profile.country || '',
            preferredLanguage: data.profile.preferredLanguage || 'en',
            themePreference: data.profile.themePreference || 'light',
          });
          onThemeChange(data.profile.themePreference || 'light');
        } else {
          const savedTheme = localStorage.getItem('secureChatTheme') || 'light';
          onThemeChange(savedTheme);
          setFormData((prev) => ({ ...prev, themePreference: savedTheme }));
        }
      } catch (error: unknown) {
        const axiosError = error as AxiosError<{ message?: string }>;
        setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Unable to load your profile.' });
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [api, onThemeChange]);

  function updateTheme(value: string) {
    setFormData((prev) => ({ ...prev, themePreference: value }));
    onThemeChange(value);
    localStorage.setItem('secureChatTheme', value);
  }

  function onChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (status.message) {
      setStatus({ type: '', message: '' });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

      const response = profile
        ? await api.put('/api/profile', payload)
        : await api.post('/api/profile', payload);

      setProfile(response.data.profile);
      setStatus({ type: 'success', message: 'Profile saved successfully.' });
      updateTheme(response.data.profile.themePreference || 'light');
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Could not save profile.' });
    } finally {
      setSaving(false);
    }
  }

  async function uploadPicture(file: File | null) {
    if (!file) return;
    setPictureLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const formDataPayload = new FormData();
      formDataPayload.append('picture', file);
      const response = await api.post('/api/profile/picture', formDataPayload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile(response.data.profile);
      setStatus({ type: 'success', message: 'Profile picture updated.' });
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Failed to upload picture.' });
    } finally {
      setPictureLoading(false);
    }
  }

  async function handlePictureChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file) {
      await uploadPicture(file);
      event.target.value = '';
    }
  }

  async function handleRemovePicture() {
    if (!profile?.profilePictureUrl) return;
    setPictureLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const response = await api.delete('/api/profile/picture');
      setProfile(response.data.profile);
      setStatus({ type: 'success', message: 'Profile picture removed.' });
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setStatus({ type: 'error', message: axiosError.response?.data?.message || 'Failed to remove picture.' });
    } finally {
      setPictureLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('secureChatToken');
    localStorage.removeItem('secureChatUser');
    navigate('/login', { replace: true });
  }

  if (loading) {
    return <p className="status">Loading profile...</p>;
  }

  return (
    <section className="profile-page">
      <header className="profile-topbar">
        <div>
          <p className="brand-kicker">Profile Management</p>
          <h2>Personal details and preferences</h2>
          <p className="brand-copy">Update your avatar, contact preferences, country, language, and app theme.</p>
        </div>
        <button type="button" className="secondary" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <div className="profile-grid">
        <section className="profile-summary card">
          <h3>Account reference</h3>
          <p>
            <strong>Username:</strong> {storedUser?.username ?? '—'}
          </p>
          <p>
            <strong>Email:</strong> {storedUser?.email ?? '—'}
          </p>
          <p>
            <strong>Profile status:</strong> {profile ? 'Active' : 'Not created yet'}
          </p>
        </section>

        <section className="profile-card card">
          <div className="avatar-row">
            <div className="avatar-preview">
              {profile?.profilePictureUrl ? (
                <img src={profile.profilePictureUrl} alt="Profile avatar" />
              ) : (
                <span>{storedUser?.username?.charAt(0).toUpperCase() || '?'}</span>
              )}
            </div>
            <div className="avatar-actions">
              <label className="file-upload">
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePictureChange} />
                {pictureLoading ? 'Uploading…' : 'Upload picture'}
              </label>
              <button type="button" className="secondary" onClick={handleRemovePicture} disabled={!profile?.profilePictureUrl || pictureLoading}>
                Remove picture
              </button>
            </div>
          </div>
        </section>
      </div>

      <form className="profile-form card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Date of birth
            <input name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={onChange} />
          </label>

          <label>
            Alternative email
            <input
              type="email"
              name="alternativeEmail"
              value={formData.alternativeEmail}
              onChange={onChange}
              placeholder="name+alt@example.com"
            />
          </label>

          <label>
            Country
            <select name="country" value={formData.country} onChange={onChange}>
              <option value="">Select a country</option>
              {supportedCountries.map((code) => (
                <option key={code} value={code}>
                  {countryLabels[code] ?? code}
                </option>
              ))}
            </select>
          </label>

          <label>
            Preferred language
            <select name="preferredLanguage" value={formData.preferredLanguage} onChange={onChange}>
              {supportedLanguages.map((lang) => (
                <option key={lang} value={lang}>
                  {languageLabels[lang] ?? lang}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="theme-fieldset">
            <legend>Theme preference</legend>
            <label>
              <input
                type="radio"
                name="themePreference"
                value="light"
                checked={formData.themePreference === 'light'}
                onChange={(event) => updateTheme(event.target.value)}
              />
              Light
            </label>
            <label>
              <input
                type="radio"
                name="themePreference"
                value="dark"
                checked={formData.themePreference === 'dark'}
                onChange={(event) => updateTheme(event.target.value)}
              />
              Dark
            </label>
          </fieldset>
        </div>

        <button type="submit" className="submit" disabled={saving}>
          {saving ? 'Saving profile…' : profile ? 'Save profile' : 'Create profile'}
        </button>

        {status.message && (
          <p className={`status ${status.type}`} role="status" aria-live="polite">
            {status.message}
          </p>
        )}
      </form>
    </section>
  );
}

export default ProfilePage;
