import type { FormEvent, ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';

type MeResponse = {
  full_name: string;
  bio?: string;
  social_links?: {
    instagram?: string | null;
    linkedin?: string | null;
  };
  profile_picture_url?: string;
};

export function ProfileEditPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ instagram?: string; linkedin?: string }>(
    {},
  );

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/api/v1/users/me');
        const data: MeResponse = res.data;
        setMe(data);
        setFullName(data.full_name);
        setBio(data.bio ?? '');
        setInstagram(data.social_links?.instagram ?? '');
        setLinkedin(data.social_links?.linkedin ?? '');
      } catch (err: any) {
        setError(err.response?.data?.error ?? 'Failed to load profile');
      }
    }
    load();
  }, []);

  function normalizeUrl(url: string) {
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      return `https://${url}`;
    }
    return url;
  }

  function isValidInstagram(url: string) {
    if (!url) return true;
    const re = /^https?:\/\/(www\.)?instagram\.com\/.+/i;
    return re.test(url);
  }

  function isValidLinkedin(url: string) {
    if (!url) return true;
    const re = /^https?:\/\/(www\.)?linkedin\.com\/.+/i;
    return re.test(url);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    const normalizedInstagram = normalizeUrl(instagram.trim());
    const normalizedLinkedin = normalizeUrl(linkedin.trim());

    const newFieldErrors: { instagram?: string; linkedin?: string } = {};
    if (!isValidInstagram(normalizedInstagram)) {
      newFieldErrors.instagram =
        'Instagram URL must look like https://www.instagram.com/username';
    }
    if (!isValidLinkedin(normalizedLinkedin)) {
      newFieldErrors.linkedin =
        'LinkedIn URL must look like https://www.linkedin.com/in/username';
    }

    if (newFieldErrors.instagram || newFieldErrors.linkedin) {
      setFieldErrors(newFieldErrors);
      return;
    }

    // Update inputs with normalized URLs so user sees the final form
    setInstagram(normalizedInstagram);
    setLinkedin(normalizedLinkedin);

    setSaving(true);
    setError(null);
    try {
      await api.put('/api/v1/users/me', {
        full_name: fullName,
        bio,
        social_links: {
          instagram: normalizedInstagram || null,
          linkedin: normalizedLinkedin || null,
        },
      });

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        await api.post('/api/v1/users/me/profile-picture', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      window.location.href = '/';
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  if (!me && !error) {
    return <p className="center">Loading profile...</p>;
  }

  return (
    <div className="auth-container">
      <header className="top-bar" style={{ maxWidth: 680 }}>
        <button
          type="button"
          className="back-button"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          ← Back
        </button>
        <h1>Edit Profile</h1>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem('access_token');
            window.location.href = '/auth';
          }}
        >
          Logout
        </button>
      </header>
      <div className="auth-card">
        <form onSubmit={handleSave}>
          <div className="field">
            <label>Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              rows={3}
            />
          </div>
          <div className="field">
            <label>Instagram URL</label>
            <input value={instagram} onChange={(e) => setInstagram(e.target.value)} />
            {fieldErrors.instagram && <p className="error">{fieldErrors.instagram}</p>}
          </div>
          <div className="field">
            <label>LinkedIn URL</label>
            <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
            {fieldErrors.linkedin && <p className="error">{fieldErrors.linkedin}</p>}
          </div>
          <div className="field">
            <label>Profile picture</label>
            <input type="file" accept="image/*" onChange={handleFileChange} />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}

