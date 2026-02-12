import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';

type Profile = {
  id: string;
  full_name: string;
  profile_picture_url?: string;
  bio?: string;
  like_count: number;
  superlike_count: number;
};

export function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function toggleLike(isSuperlike: boolean) {
    try {
      const res = await api.post(`/api/v1/users/${userId}/like`, {
        is_superlike: isSuperlike,
      });
      if (profile && !isSuperlike) {
        setProfile({ ...profile, like_count: res.data.like_count });
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

  if (loading) return <p className="center">Loading profile...</p>;
  if (error) return <p className="center">{error}</p>;
  if (!profile) return <p className="center">Profile not found</p>;

  return (
    <div className="home">
      <header className="top-bar">
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
          <h3>Leave a comment</h3>
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

