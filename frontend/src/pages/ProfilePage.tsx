import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { getApiErrorMessage } from '../utils/errors';
import {
  formatFreezeDate,
  isBatchFrozen,
  type BatchInfo,
} from '../utils/yearbook';

type SocialLinks = {
  instagram?: string | null;
  linkedin?: string | null;
  otherLinks?: { label: string; url: string }[];
};

type ProfileComment = {
  id: string;
  from_user: {
    id: string;
    full_name: string;
    profile_picture_url?: string;
  };
  content: string;
  created_at: string;
  is_visible: boolean;
};

type Profile = {
  id: string;
  full_name: string;
  profile_picture_url?: string;
  bio?: string;
  social_links?: SocialLinks;
  like_count: number;
  superlike_count: number;
  superlatives: {
    id: string;
    name: string;
    vote_count: number;
  }[];
  comments: ProfileComment[];
  is_owner: boolean;
  current_user_interactions: {
    has_liked: boolean;
    has_superliked: boolean;
  };
};

type MeResponse = {
  id: string;
  batch: BatchInfo | null;
};

type Notice = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

export function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewer, setViewer] = useState<MeResponse | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [interactionLoading, setInteractionLoading] = useState<
    'like' | 'superlike' | null
  >(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      if (!userId) {
        setLoading(false);
        setError('Profile not found');
        return;
      }

      try {
        const [profileResponse, meResponse] = await Promise.all([
          api.get(`/api/v1/users/${userId}`),
          api.get('/api/v1/users/me'),
        ]);

        setProfile(profileResponse.data);
        setViewer({
          id: meResponse.data.id,
          batch: meResponse.data.batch,
        });
      } catch (errorValue: unknown) {
        setError(getApiErrorMessage(errorValue, 'Failed to load profile'));
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [userId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const frozen = useMemo(
    () => isBatchFrozen(viewer?.batch ?? null),
    [viewer?.batch],
  );
  const freezeDateLabel = useMemo(
    () => formatFreezeDate(viewer?.batch ?? null),
    [viewer?.batch],
  );

  const hasPublicComments = useMemo(
    () => profile?.comments.some((entry) => entry.is_visible) ?? false,
    [profile?.comments],
  );

  const sortedSuperlatives = useMemo(() => {
    if (!profile?.superlatives) return [];
    return [...profile.superlatives].sort((a, b) => b.vote_count - a.vote_count);
  }, [profile?.superlatives]);

  const socialLinks = useMemo(() => {
    if (!profile?.social_links) return [];

    const links: { label: string; url: string }[] = [];
    if (profile.social_links.instagram) {
      links.push({ label: 'Instagram', url: profile.social_links.instagram });
    }
    if (profile.social_links.linkedin) {
      links.push({ label: 'LinkedIn', url: profile.social_links.linkedin });
    }

    for (const link of profile.social_links.otherLinks ?? []) {
      if (link.label && link.url) {
        links.push({ label: link.label, url: link.url });
      }
    }

    return links;
  }, [profile?.social_links]);

  async function toggleLike(isSuperlike: boolean) {
    if (!profile || !userId) return;

    if (profile.is_owner) {
      setNotice({ tone: 'info', message: 'You cannot react to your own profile.' });
      return;
    }

    if (frozen) {
      setNotice({
        tone: 'info',
        message: `Interactions are disabled because this batch froze on ${freezeDateLabel}.`,
      });
      return;
    }

    setInteractionLoading(isSuperlike ? 'superlike' : 'like');

    try {
      const response = await api.post(`/api/v1/users/${userId}/like`, {
        is_superlike: isSuperlike,
      });

      const interactions = response.data.current_user_interactions as
        | { has_liked: boolean; has_superliked: boolean }
        | undefined;

      setProfile((previous) => {
        if (!previous) return previous;

        return {
          ...previous,
          like_count: response.data.like_count,
          superlike_count: response.data.superlike_count,
          current_user_interactions: {
            has_liked: interactions?.has_liked ?? previous.current_user_interactions.has_liked,
            has_superliked:
              interactions?.has_superliked ??
              previous.current_user_interactions.has_superliked,
          },
        };
      });
    } catch (errorValue: unknown) {
      setNotice({
        tone: 'error',
        message: getApiErrorMessage(errorValue, 'Unable to update reaction'),
      });
    } finally {
      setInteractionLoading(null);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !userId) return;
    if (!comment.trim()) return;

    if (frozen) {
      setNotice({
        tone: 'info',
        message: `Commenting is disabled because this batch froze on ${freezeDateLabel}.`,
      });
      return;
    }

    setCommentLoading(true);

    try {
      const response = await api.post(`/api/v1/users/${userId}/comments`, {
        content: comment.trim(),
      });

      setComment('');

      if (profile.is_owner) {
        setProfile((previous) => {
          if (!previous) return previous;
          return {
            ...previous,
            comments: [response.data, ...previous.comments],
          };
        });
      }

      setNotice({
        tone: 'success',
        message: 'Comment posted. It is private until the profile owner makes comments public.',
      });
    } catch (errorValue: unknown) {
      setNotice({
        tone: 'error',
        message: getApiErrorMessage(errorValue, 'Unable to post comment'),
      });
    } finally {
      setCommentLoading(false);
    }
  }

  async function toggleCommentVisibility() {
    if (!profile?.is_owner) return;

    setVisibilityLoading(true);

    try {
      const newVisibility = !hasPublicComments;
      await api.patch('/api/v1/users/me/comments/visibility', {
        is_visible: newVisibility,
      });

      setProfile((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          comments: previous.comments.map((entry) => ({
            ...entry,
            is_visible: newVisibility,
          })),
        };
      });

      setNotice({
        tone: 'success',
        message: newVisibility
          ? 'All profile comments are now public.'
          : 'Profile comments are now private again.',
      });
    } catch (errorValue: unknown) {
      setNotice({
        tone: 'error',
        message: getApiErrorMessage(errorValue, 'Unable to update comment visibility'),
      });
    } finally {
      setVisibilityLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-shell">
        <div className="loading-screen">Loading profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="page-shell">
        <section className="panel unauth-shell">
          <h1>Profile unavailable</h1>
          <p>{error ?? 'This profile could not be found.'}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/app')}
          >
            Back to hub
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell profile-page">
      <header className="top-nav">
        <div className="brand-wrap">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate('/app')}
          >
            Back
          </button>
          <div>
            <p className="eyebrow">Profile</p>
            <h1>{profile.full_name}</h1>
          </div>
        </div>

        <div className="nav-actions">
          {profile.is_owner && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/profile/edit')}
            >
              Edit profile
            </button>
          )}
        </div>
      </header>

      <main className="profile-layout">
        {notice && <p className={`inline-notice ${notice.tone}`}>{notice.message}</p>}

        <section className="panel profile-main-card">
          <div className="avatar avatar-large">
            {profile.profile_picture_url ? (
              <img src={profile.profile_picture_url} alt={profile.full_name} />
            ) : (
              <span>{profile.full_name.slice(0, 1)}</span>
            )}
          </div>

          <h2>{profile.full_name}</h2>
          <p className="muted center-text">{profile.bio || 'No bio added yet.'}</p>

          <div className="social-link-list">
            {socialLinks.length > 0 ? (
              socialLinks.map((link) => (
                <a
                  key={`${link.label}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="social-link"
                >
                  {link.label}
                </a>
              ))
            ) : (
              <p className="muted">No social links shared.</p>
            )}
          </div>

          <div className="stat-grid">
            <div className="stat-item">
              <p>Likes</p>
              <strong>{profile.like_count}</strong>
            </div>
            <div className="stat-item">
              <p>Superlikes</p>
              <strong>{profile.superlike_count}</strong>
            </div>
            <div className="stat-item">
              <p>Comments</p>
              <strong>{profile.comments.length}</strong>
            </div>
          </div>

          <div className="interaction-row">
            <button
              type="button"
              className={`btn btn-secondary ${
                profile.current_user_interactions.has_liked ? 'is-selected' : ''
              }`}
              onClick={() => toggleLike(false)}
              disabled={interactionLoading !== null || frozen || profile.is_owner}
            >
              {interactionLoading === 'like'
                ? 'Updating...'
                : profile.current_user_interactions.has_liked
                  ? 'Liked'
                  : 'Like'}
            </button>

            <button
              type="button"
              className={`btn btn-primary ${
                profile.current_user_interactions.has_superliked ? 'is-selected' : ''
              }`}
              onClick={() => toggleLike(true)}
              disabled={interactionLoading !== null || frozen || profile.is_owner}
            >
              {interactionLoading === 'superlike'
                ? 'Updating...'
                : profile.current_user_interactions.has_superliked
                  ? 'Superliked'
                  : 'Superlike'}
            </button>
          </div>

          {frozen && (
            <p className="inline-notice info">
              This batch froze on {freezeDateLabel}. Reactions and new comments are
              now read-only.
            </p>
          )}
        </section>

        <section className="panel superlative-panel">
          <div className="section-head">
            <h3>Superlatives</h3>
          </div>
          {sortedSuperlatives.length > 0 ? (
            <ul className="badge-list">
              {sortedSuperlatives.map((entry) => (
                <li key={entry.id} className="badge-item">
                  <span>{entry.name}</span>
                  <strong>{entry.vote_count}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No superlatives recorded yet.</p>
          )}
        </section>

        <section className="panel comments-panel">
          <div className="section-head">
            <h3>Comments</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setCommentsOpen((previous) => !previous)}
            >
              {commentsOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>

          {profile.is_owner && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={toggleCommentVisibility}
              disabled={visibilityLoading}
            >
              {visibilityLoading
                ? 'Updating...'
                : hasPublicComments
                  ? 'Make all comments private'
                  : 'Make all comments public'}
            </button>
          )}

          {commentsOpen && (
            <>
              <div className="comments-list">
                {profile.comments.length > 0 ? (
                  profile.comments.map((entry) => (
                    <article key={entry.id} className="comment-item">
                      <div className="comment-avatar avatar">
                        {entry.from_user.profile_picture_url ? (
                          <img
                            src={entry.from_user.profile_picture_url}
                            alt={entry.from_user.full_name}
                          />
                        ) : (
                          <span>{entry.from_user.full_name.slice(0, 1)}</span>
                        )}
                      </div>

                      <div className="comment-content">
                        <div className="comment-meta">
                          <strong>{entry.from_user.full_name}</strong>
                          <span>
                            {new Date(entry.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          {profile.is_owner && (
                            <span className={`comment-visibility ${entry.is_visible ? 'public' : 'private'}`}>
                              {entry.is_visible ? 'Public' : 'Private'}
                            </span>
                          )}
                        </div>
                        <p>{entry.content}</p>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="muted">No comments yet.</p>
                )}
              </div>

              <form onSubmit={submitComment} className="comment-form">
                <label className="field">
                  <span>Leave a comment</span>
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    maxLength={500}
                    rows={4}
                    placeholder="Write something memorable"
                    disabled={frozen}
                  />
                </label>

                <div className="comment-form-footer">
                  <span className="muted">{comment.length}/500</span>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={commentLoading || frozen || !comment.trim()}
                  >
                    {commentLoading ? 'Posting...' : 'Post comment'}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
