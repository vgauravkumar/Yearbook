import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { getApiErrorMessage } from '../utils/errors';
import {
  formatFreezeDate,
  isBatchFrozen,
  type BatchInfo,
} from '../utils/yearbook';

type EditableLink = {
  label: string;
  url: string;
};

type MeResponse = {
  id: string;
  full_name: string;
  bio?: string;
  social_links?: {
    instagram?: string | null;
    linkedin?: string | null;
    otherLinks?: EditableLink[];
  };
  profile_picture_url?: string;
  batch: BatchInfo | null;
};

export function ProfileEditPage() {
  const navigate = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [otherLinks, setOtherLinks] = useState<EditableLink[]>([{ label: '', url: '' }]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    instagram?: string;
    linkedin?: string;
    otherLinks?: Record<number, string>;
  }>({});

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await api.get('/api/v1/users/me');
        const data: MeResponse = response.data;

        setMe(data);
        setFullName(data.full_name);
        setBio(data.bio ?? '');
        setInstagram(data.social_links?.instagram ?? '');
        setLinkedin(data.social_links?.linkedin ?? '');

        const existingOtherLinks = data.social_links?.otherLinks ?? [];
        setOtherLinks(
          existingOtherLinks.length > 0
            ? existingOtherLinks.map((entry) => ({
                label: entry.label,
                url: entry.url,
              }))
            : [{ label: '', url: '' }],
        );
      } catch (errorValue: unknown) {
        setError(getApiErrorMessage(errorValue, 'Failed to load profile'));
      }
    }

    loadProfile();
  }, []);

  const frozen = useMemo(
    () => isBatchFrozen(me?.batch ?? null),
    [me?.batch],
  );
  const freezeDateLabel = useMemo(
    () => formatFreezeDate(me?.batch ?? null),
    [me?.batch],
  );

  const previewImageUrl = useMemo(() => {
    if (file) {
      return URL.createObjectURL(file);
    }
    return me?.profile_picture_url ?? '';
  }, [file, me?.profile_picture_url]);

  useEffect(
    () => () => {
      if (file) {
        URL.revokeObjectURL(previewImageUrl);
      }
    },
    [file, previewImageUrl],
  );

  function normalizeUrl(url: string): string {
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      return `https://${url}`;
    }
    return url;
  }

  function isValidInstagram(url: string): boolean {
    if (!url) return true;
    return /^https?:\/\/(www\.)?instagram\.com\/.+/i.test(url);
  }

  function isValidLinkedIn(url: string): boolean {
    if (!url) return true;
    return /^https?:\/\/(www\.)?linkedin\.com\/.+/i.test(url);
  }

  function isValidUrl(url: string): boolean {
    if (!url) return false;
    return /^https?:\/\/.+/i.test(url);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (frozen) {
      setError(`Profile editing is disabled because this batch froze on ${freezeDateLabel}.`);
      return;
    }

    setFieldErrors({});

    const normalizedInstagram = normalizeUrl(instagram.trim());
    const normalizedLinkedin = normalizeUrl(linkedin.trim());

    const newFieldErrors: {
      instagram?: string;
      linkedin?: string;
      otherLinks?: Record<number, string>;
    } = {};

    if (!isValidInstagram(normalizedInstagram)) {
      newFieldErrors.instagram =
        'Instagram URL must look like https://www.instagram.com/username';
    }

    if (!isValidLinkedIn(normalizedLinkedin)) {
      newFieldErrors.linkedin =
        'LinkedIn URL must look like https://www.linkedin.com/in/username';
    }

    const normalizedOtherLinks: EditableLink[] = [];
    const otherLinkErrors: Record<number, string> = {};

    for (let index = 0; index < otherLinks.length; index += 1) {
      const row = otherLinks[index];
      const label = row.label.trim();
      const url = row.url.trim();

      if (!label && !url) {
        continue;
      }

      if (!label || !url) {
        otherLinkErrors[index] = 'Provide both a label and URL.';
        continue;
      }

      const normalizedUrl = normalizeUrl(url);
      if (!isValidUrl(normalizedUrl)) {
        otherLinkErrors[index] = 'URL must start with http:// or https://';
        continue;
      }

      normalizedOtherLinks.push({ label, url: normalizedUrl });
    }

    if (Object.keys(otherLinkErrors).length > 0) {
      newFieldErrors.otherLinks = otherLinkErrors;
    }

    if (newFieldErrors.instagram || newFieldErrors.linkedin || newFieldErrors.otherLinks) {
      setFieldErrors(newFieldErrors);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.put('/api/v1/users/me', {
        full_name: fullName,
        bio,
        social_links: {
          instagram: normalizedInstagram || null,
          linkedin: normalizedLinkedin || null,
          otherLinks: normalizedOtherLinks,
        },
      });

      if (file) {
        const formData = new FormData();
        formData.append('file', file);

        await api.post('/api/v1/users/me/profile-picture', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      navigate('/app');
    } catch (errorValue: unknown) {
      setError(getApiErrorMessage(errorValue, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) return;

    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB.');
      return;
    }

    setError(null);
    setFile(selectedFile);
  }

  function updateOtherLink(index: number, patch: Partial<EditableLink>) {
    setOtherLinks((previous) =>
      previous.map((entry, rowIndex) =>
        rowIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function addOtherLink() {
    if (otherLinks.length >= 3) return;
    setOtherLinks((previous) => [...previous, { label: '', url: '' }]);
  }

  function removeOtherLink(index: number) {
    setOtherLinks((previous) => {
      const next = previous.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [{ label: '', url: '' }];
    });
  }

  function handleLogout() {
    localStorage.removeItem('access_token');
    navigate('/auth');
  }

  if (!me && !error) {
    return (
      <div className="page-shell">
        <div className="loading-screen">Loading profile editor...</div>
      </div>
    );
  }

  return (
    <div className="page-shell edit-page">
      <header className="top-nav">
        <div className="brand-wrap">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>
            Back
          </button>
          <div>
            <p className="eyebrow">Profile</p>
            <h1>Edit your page</h1>
          </div>
        </div>

        <div className="nav-actions">
          <button type="button" className="btn btn-danger" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="edit-layout">
        <section className="panel profile-preview">
          <h2>Preview</h2>

          <div className="avatar avatar-large">
            {previewImageUrl ? (
              <img src={previewImageUrl} alt="Profile preview" />
            ) : (
              <span>{fullName ? fullName.slice(0, 1) : 'Y'}</span>
            )}
          </div>

          <h3>{fullName || 'Your Name'}</h3>
          <p>{bio || 'Your bio will appear here.'}</p>

          <div className="pill-list">
            {instagram && <span className="pill">Instagram</span>}
            {linkedin && <span className="pill">LinkedIn</span>}
            {otherLinks.some((entry) => entry.label && entry.url) && (
              <span className="pill">Custom links</span>
            )}
          </div>

          {frozen && (
            <p className="inline-notice info">
              Batch frozen on {freezeDateLabel}. Profile edits are read-only.
            </p>
          )}
        </section>

        <section className="panel edit-form-panel">
          <form onSubmit={handleSave} className="stack-form">
            <label className="field">
              <span>Full name</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                maxLength={100}
                disabled={frozen}
              />
            </label>

            <label className="field">
              <span>Bio</span>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={200}
                rows={4}
                placeholder="Tell your batch about yourself"
                disabled={frozen}
              />
              <small className="field-helper">{bio.length}/200</small>
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Instagram URL</span>
                <input
                  value={instagram}
                  onChange={(event) => setInstagram(event.target.value)}
                  placeholder="https://instagram.com/username"
                  disabled={frozen}
                />
                {fieldErrors.instagram && (
                  <p className="inline-notice error">{fieldErrors.instagram}</p>
                )}
              </label>

              <label className="field">
                <span>LinkedIn URL</span>
                <input
                  value={linkedin}
                  onChange={(event) => setLinkedin(event.target.value)}
                  placeholder="https://linkedin.com/in/username"
                  disabled={frozen}
                />
                {fieldErrors.linkedin && (
                  <p className="inline-notice error">{fieldErrors.linkedin}</p>
                )}
              </label>
            </div>

            <div className="field">
              <span>Other links (up to 3)</span>
              <div className="other-link-list">
                {otherLinks.map((entry, index) => (
                  <div key={`other-link-${index}`} className="other-link-row">
                    <input
                      value={entry.label}
                      onChange={(event) =>
                        updateOtherLink(index, { label: event.target.value })
                      }
                      placeholder="Label (Portfolio, GitHub, etc.)"
                      disabled={frozen}
                    />
                    <input
                      value={entry.url}
                      onChange={(event) =>
                        updateOtherLink(index, { url: event.target.value })
                      }
                      placeholder="https://example.com"
                      disabled={frozen}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeOtherLink(index)}
                      disabled={frozen}
                    >
                      Remove
                    </button>
                    {fieldErrors.otherLinks?.[index] && (
                      <p className="inline-notice error">
                        {fieldErrors.otherLinks[index]}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={addOtherLink}
                disabled={frozen || otherLinks.length >= 3}
              >
                Add custom link
              </button>
            </div>

            <label className="field">
              <span>Profile picture</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                disabled={frozen}
              />
              <small className="field-helper">Square image recommended. Max 5MB.</small>
            </label>

            {error && <p className="inline-notice error">{error}</p>}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={saving || frozen}
            >
              {saving ? 'Saving profile...' : frozen ? 'Batch is frozen' : 'Save changes'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
