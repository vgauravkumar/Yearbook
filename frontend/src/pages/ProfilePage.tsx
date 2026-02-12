import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

type Profile = {
  id: string;
  full_name: string;
  profile_picture_url?: string;
  bio?: string;
  like_count: number;
  superlike_count: number;
  is_owner?: boolean;
  comments?: {
    id: string;
    from_user: {
      id: string;
      full_name: string;
      profile_picture_url?: string;
    };
    content: string;
    created_at: string;
    is_visible: boolean;
  }[];
};

export function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibilityLoading, setVisibilityLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/api/v1/users/${userId}`);
        setProfile(res.data);
      } catch (err: any) {
        setError(err.response?.data?.error ?? 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    if (userId) {
      load();
    }
  }, [userId]);

  const hasPublicComments = useMemo(
    () => !!profile?.comments?.some((c) => c.is_visible),
    [profile],
  );

  async function toggleLike(isSuperlike: boolean) {
    try {
      const res = await api.post(`/api/v1/users/${userId}/like`, {
        is_superlike: isSuperlike,
      });
      if (profile) {
        setProfile({
          ...profile,
          like_count: res.data.like_count,
          superlike_count: res.data.superlike_count,
        });
      }
    } catch {
      // ignore for now
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    try {
      await api.post(`/api/v1/users/${userId}/comments`, { content: comment });
      setComment('');
      alert('Comment submitted (initially private)');
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to submit comment');
    }
  }

  async function toggleCommentsVisibility() {
    if (!profile?.is_owner) return;
    setVisibilityLoading(true);
    try {
      const newVisible = !hasPublicComments;
      await api.patch('/api/v1/users/me/comments/visibility', {
        is_visible: newVisible,
      });
      if (profile.comments) {
        setProfile({
          ...profile,
          comments: profile.comments.map((c) => ({
            ...c,
            is_visible: newVisible,
          })),
        });
      }
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'Failed to update visibility');
    } finally {
      setVisibilityLoading(false);
    }
  }

  if (loading) return <p className="center">Loading profile...</p>;
  if (error) return <p className="center">{error}</p>;
  if (!profile) return <p className="center">Profile not found</p>;

  return (
    <div className="home">
      <header className="top-bar">
        <button
          type="button"
          className="back-button"
          onClick={() => (window.location.href = '/directory')}
        >
          ← Back
        </button>
        <h1>Yearbook</h1>
      </header>
      <main className="profile-main">
        <div className="profile-header">
          <div className="avatar large">
            {profile.profile_picture_url ? (
              <img src={profile.profile_picture_url} alt={profile.full_name} />
            ) : (
              <span>{profile.full_name[0]}</span>
            )}
          </div>
          <h2>{profile.full_name}</h2>
          {profile.bio && <p className="bio">{profile.bio}</p>}
          <div className="stats">
            <span>❤️ {profile.like_count}</span>
            <span>🌟 {profile.superlike_count}</span>
          </div>
          <div className="actions">
            <button onClick={() => toggleLike(false)}>Like</button>
            <button onClick={() => toggleLike(true)}>Superlike</button>
          </div>
        </div>
        <section className="comments-section">
          <h3>Comments</h3>
          {profile.is_owner && (
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                onClick={toggleCommentsVisibility}
                disabled={visibilityLoading}
              >
                {visibilityLoading
                  ? 'Updating...'
                  : hasPublicComments
                  ? 'Hide comments from public'
                  : 'Show my comments publicly'}
              </button>
            </div>
          )}
          {profile.comments && profile.comments.length > 0 && (
            <ul style={{ marginBottom: '1rem', paddingLeft: 0, listStyle: 'none' }}>
              {profile.comments.map((c) => (
                <li key={c.id} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="avatar">
                      {c.from_user.profile_picture_url ? (
                        <img
                          src={c.from_user.profile_picture_url}
                          alt={c.from_user.full_name}
                        />
                      ) : (
                        <span>{c.from_user.full_name[0]}</span>
                      )}
                    </div>
                    <div>
                      <strong>{c.from_user.full_name}</strong>
                      {profile.is_owner && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                          {c.is_visible ? 'Public' : 'Private'}
                        </span>
                      )}
                      <div style={{ fontSize: '0.875rem' }}>{c.content}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <h4>Leave a comment</h4>
          <form onSubmit={submitComment}>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={3}
            />
            <button type="submit">Post comment</button>
          </form>
        </section>
      </main>
    </div>
  );
}

