import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { getApiErrorMessage } from '../utils/errors';
import { formatBatchLabel, formatFreezeDate, type BatchInfo } from '../utils/yearbook';

type SocialLinks = {
  instagram?: string | null;
  linkedin?: string | null;
  otherLinks?: { label: string; url: string }[];
};

type SuperlativeVoteSummary = {
  id: string;
  name: string;
  vote_count: number;
};

type SuperlativeDefinition = {
  id: string;
  name: string;
};

type MemberProfile = {
  id: string;
  full_name: string;
  profile_picture_url?: string | null;
  bio?: string;
  social_links?: SocialLinks;
  like_count: number;
  superlike_count: number;
  superlatives: SuperlativeVoteSummary[];
};

type BatchPayload = BatchInfo & {
  id: string;
  member_count: number;
};

type ViewerContext = {
  is_authenticated: boolean;
  is_member: boolean;
  is_own_batch: boolean;
  can_join: boolean;
  current_batch_id: string | null;
};

type BatchResponse = {
  batch: BatchPayload;
  viewer?: ViewerContext;
  members?: MemberProfile[];
  students?: MemberProfile[];
};

type MembersResponse = {
  members?: MemberProfile[];
  students?: MemberProfile[];
};

type SuperlativeResponse = {
  superlatives?: SuperlativeDefinition[];
};

const DEFAULT_VIEWER: ViewerContext = {
  is_authenticated: false,
  is_member: false,
  is_own_batch: false,
  can_join: false,
  current_batch_id: null,
};

function toExternalUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function JoinBatchConfirmationPage({ batchId }: { batchId: string }) {
  const navigate = useNavigate();
  const [batch, setBatch] = useState<BatchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const batchLabel = useMemo(() => {
    if (!batch) return '';
    return `${batch.institution_name ?? 'Unknown institution'} — ${batch.graduation_month} ${batch.graduation_year}`;
  }, [batch]);

  const freezeDateLabel = useMemo(() => formatFreezeDate(batch), [batch]);

  useEffect(() => {
    let cancelled = false;

    async function loadBatch() {
      const token = localStorage.getItem('access_token');
      if (!token) {
        navigate(`/auth?mode=signup&next=/join/batch/${batchId}`, { replace: true });
        return;
      }

      try {
        const response = await api.get<BatchResponse>(`/api/v1/batches/${batchId}`);
        if (cancelled) return;
        setBatch(response.data.batch);
      } catch (errorValue: unknown) {
        if (axios.isAxiosError(errorValue) && errorValue.response?.status === 401) {
          localStorage.removeItem('access_token');
          navigate(`/auth?mode=signup&next=/join/batch/${batchId}`, { replace: true });
          return;
        }

        if (!cancelled) {
          setError(getApiErrorMessage(errorValue, 'Unable to load batch details'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadBatch();
    return () => {
      cancelled = true;
    };
  }, [batchId, navigate]);

  async function handleJoinBatch() {
    if (!batch?.id) return;

    setJoining(true);
    setError(null);

    try {
      await api.post(`/api/v1/batches/${batch.id}/join`);
      navigate('/app', { replace: true });
    } catch (errorValue: unknown) {
      setError(getApiErrorMessage(errorValue, 'Unable to join this yearbook'));
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="page-shell onboarding-page">
        <div className="loading-screen">Loading batch details...</div>
      </div>
    );
  }

  if (!batch || error) {
    return (
      <div className="page-shell onboarding-page">
        <section className="panel onboarding-shell">
          <header className="page-heading">
            <p className="eyebrow">Join yearbook</p>
            <h1>Batch unavailable</h1>
            <p>{error ?? 'This batch could not be found.'}</p>
          </header>

          <div className="form-actions">
            <Link className="btn btn-primary btn-block" to="/onboard">
              Back to onboarding
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell onboarding-page">
      <section className="panel onboarding-shell join-shell">
        <header className="page-heading">
          <p className="eyebrow">Join yearbook</p>
          <h1>You&apos;re joining:</h1>
          <p className="join-batch-label">{batchLabel}</p>
          <p>{batch.member_count} members already in</p>
        </header>

        {batch.is_frozen ? (
          <p className="inline-notice error">
            This yearbook has been frozen as of {freezeDateLabel}. You can view it but
            cannot create a profile or interact.
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleJoinBatch}
            disabled={joining}
          >
            {joining ? 'Joining...' : 'Join this yearbook'}
          </button>
        )}

        {error && <p className="inline-notice error">{error}</p>}

        <div className="form-actions">
          <Link className="btn btn-ghost btn-block" to="/onboard">
            Go back
          </Link>
        </div>
      </section>
    </div>
  );
}

function PublicInviteBatchPage({ inviteCode }: { inviteCode: string }) {
  const navigate = useNavigate();
  const [batch, setBatch] = useState<BatchPayload | null>(null);
  const [viewer, setViewer] = useState<ViewerContext>(DEFAULT_VIEWER);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [superlatives, setSuperlatives] = useState<SuperlativeDefinition[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [flippedMemberId, setFlippedMemberId] = useState<string | null>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const batchLabel = useMemo(() => formatBatchLabel(batch), [batch]);
  const freezeDateLabel = useMemo(() => formatFreezeDate(batch), [batch]);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const socialLinks = useMemo(() => {
    if (!selectedMember?.social_links) return [];

    const links: { label: string; url: string }[] = [];

    if (selectedMember.social_links.instagram) {
      links.push({
        label: 'Instagram',
        url: toExternalUrl(selectedMember.social_links.instagram),
      });
    }

    if (selectedMember.social_links.linkedin) {
      links.push({
        label: 'LinkedIn',
        url: toExternalUrl(selectedMember.social_links.linkedin),
      });
    }

    for (const link of selectedMember.social_links.otherLinks ?? []) {
      if (!link.label || !link.url) continue;
      links.push({
        label: link.label,
        url: toExternalUrl(link.url),
      });
    }

    return links;
  }, [selectedMember]);

  useEffect(() => {
    let cancelled = false;

    async function loadPublicBatch() {
      try {
        const batchResponse = await api.get<BatchResponse>(
          `/api/v1/batches/join/${inviteCode}`,
        );

        if (cancelled) return;

        const loadedBatch = batchResponse.data.batch;
        const loadedViewer = batchResponse.data.viewer ?? DEFAULT_VIEWER;

        if (!loadedBatch?.id) {
          throw new Error('Invalid batch response');
        }

        if (loadedViewer.is_own_batch) {
          navigate('/app', { replace: true });
          return;
        }

        let loadedMembers = batchResponse.data.members ?? batchResponse.data.students ?? [];
        const superlativeResponsePromise = api.get<SuperlativeResponse>('/api/v1/superlatives');

        if (loadedMembers.length === 0) {
          const membersResponse = await api.get<MembersResponse>(
            `/api/v1/batches/${loadedBatch.id}/members`,
            {
              params: { page: 1, limit: 300, sort: 'trending' },
            },
          );
          loadedMembers = membersResponse.data.members ?? membersResponse.data.students ?? [];
        }

        const superlativeResponse = await superlativeResponsePromise;

        if (cancelled) return;

        setBatch(loadedBatch);
        setViewer(loadedViewer);
        setMembers(loadedMembers);
        setSuperlatives(superlativeResponse.data.superlatives ?? []);
      } catch (errorValue: unknown) {
        if (!cancelled) {
          setError(getApiErrorMessage(errorValue, 'Unable to load yearbook'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPublicBatch();
    return () => {
      cancelled = true;
    };
  }, [inviteCode, navigate]);

  useEffect(() => {
    if (loading || viewer.is_authenticated) {
      setStickyVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setStickyVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, [loading, viewer.is_authenticated]);

  if (loading) {
    return (
      <div className="page-shell hub-page">
        <div className="loading-screen">Loading yearbook...</div>
      </div>
    );
  }

  if (!batch || error) {
    return (
      <div className="page-shell hub-page">
        <section className="panel unauth-shell">
          <h1>Yearbook unavailable</h1>
          <p>{error ?? 'This invite does not match any yearbook.'}</p>
          <Link className="btn btn-primary" to="/explore">
            Explore yearbooks
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell hub-page public-batch-page">
      <header className="top-nav hub-header">
        <div className="brand-wrap">
          <span className="brand-mark">YB</span>
          <div>
            <p className="eyebrow">Public Yearbook</p>
            <h1>{batchLabel}</h1>
          </div>
        </div>

        <div className="nav-actions">
          <Link className="btn btn-secondary" to="/explore">
            Explore yearbooks
          </Link>
          {!viewer.is_authenticated && (
            <Link className="btn btn-ghost" to={`/auth?mode=login&next=/join/${inviteCode}`}>
              Log in
            </Link>
          )}
        </div>
      </header>

      <main
        className={`hub-shell public-hub-shell ${
          viewer.is_authenticated ? '' : 'has-public-sticky-cta'
        }`}
      >
        <section className="panel public-batch-header">
          <div className="public-batch-header-copy">
            <h2>{batchLabel}</h2>
            <div className="toolbar-meta">
              <span className="pill">{batch.member_count} members</span>
              {batch.is_frozen && (
                <span className="pill frozen">Frozen · {freezeDateLabel}</span>
              )}
            </div>
          </div>

          {viewer.is_authenticated && !viewer.is_member && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/join/batch/${batch.id}`)}
            >
              Join this yearbook
            </button>
          )}
        </section>

        <section className="hub-content">
          <div className="directory-grid discover-grid public-discover-grid">
            {members.map((member) => {
              const isFlipped = flippedMemberId === member.id;
              const voteMap = new Map(
                member.superlatives.map((entry) => [entry.id, entry.vote_count]),
              );

              const renderedSuperlatives =
                superlatives.length > 0
                  ? superlatives.map((entry) => ({
                      id: entry.id,
                      name: entry.name,
                      vote_count: voteMap.get(entry.id) ?? 0,
                    }))
                  : member.superlatives;

              return (
                <article key={member.id} className={`year-card ${isFlipped ? 'is-flipped' : ''}`}>
                  <div className="year-card-inner">
                    <section className="year-card-face year-card-front">
                      <div className="card-top-actions">
                        <span className="muted">Yearbook profile</span>
                        <button
                          type="button"
                          className="flip-trigger"
                          onClick={() => setFlippedMemberId(member.id)}
                          aria-label={`Show superlatives for ${member.full_name}`}
                        >
                          i
                        </button>
                      </div>

                      <button
                        type="button"
                        className="year-card-open"
                        onClick={() => setSelectedMemberId(member.id)}
                      >
                        <div className="avatar">
                          {member.profile_picture_url ? (
                            <img src={member.profile_picture_url} alt={member.full_name} />
                          ) : (
                            <span>{member.full_name.slice(0, 1)}</span>
                          )}
                        </div>
                        <h2>{member.full_name}</h2>
                        <p>{member.bio || 'No bio yet.'}</p>
                      </button>

                      <div className="tile-counts">
                        <span>{member.like_count} likes</span>
                        <span>{member.superlike_count} superlikes</span>
                      </div>
                    </section>

                    <section className="year-card-face year-card-back">
                      <div className="year-card-back-head">
                        <h3>Superlatives</h3>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setFlippedMemberId(null)}
                        >
                          Close
                        </button>
                      </div>

                      {renderedSuperlatives.length > 0 ? (
                        <ul className="vote-list">
                          {renderedSuperlatives.map((superlative) => (
                            <li key={`${member.id}-${superlative.id}`} className="vote-row readonly">
                              <div>
                                <p className="vote-title">{superlative.name}</p>
                                <p className="vote-meta">{superlative.vote_count} votes</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">No superlatives recorded.</p>
                      )}

                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        onClick={() => setSelectedMemberId(member.id)}
                      >
                        Open profile
                      </button>
                    </section>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      {!viewer.is_authenticated && (
        <aside className={`public-sticky-cta ${stickyVisible ? 'is-visible' : ''}`}>
          <p>
            This is {batch.institution_name ?? 'this institution'}&apos;s yearbook. Build
            yours.
          </p>
          <div className="public-sticky-cta-actions">
            <Link className="btn btn-primary" to={`/auth?mode=signup&next=/join/${inviteCode}`}>
              Join this yearbook
            </Link>
            <Link className="btn btn-secondary" to="/auth?mode=signup">
              Build my yearbook
            </Link>
          </div>
        </aside>
      )}

      {selectedMember && (
        <div
          className="public-profile-overlay"
          role="presentation"
          onClick={() => setSelectedMemberId(null)}
        >
          <article
            className="panel public-profile-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-head">
              <h3>Profile</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedMemberId(null)}
              >
                Close
              </button>
            </div>

            <div className="public-profile-main">
              <div className="avatar avatar-large">
                {selectedMember.profile_picture_url ? (
                  <img src={selectedMember.profile_picture_url} alt={selectedMember.full_name} />
                ) : (
                  <span>{selectedMember.full_name.slice(0, 1)}</span>
                )}
              </div>

              <div>
                <h2>{selectedMember.full_name}</h2>
                <p>{selectedMember.bio || 'No bio shared.'}</p>
              </div>
            </div>

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
                <strong>{selectedMember.like_count}</strong>
              </div>
              <div className="stat-item">
                <p>Superlikes</p>
                <strong>{selectedMember.superlike_count}</strong>
              </div>
              <div className="stat-item">
                <p>Superlatives won</p>
                <strong>{selectedMember.superlatives.length}</strong>
              </div>
            </div>

            <section className="public-superlative-list">
              <h4>Superlatives won</h4>
              {selectedMember.superlatives.length > 0 ? (
                <ul className="badge-list">
                  {[...selectedMember.superlatives]
                    .sort((left, right) => right.vote_count - left.vote_count)
                    .map((entry) => (
                      <li key={`${selectedMember.id}-${entry.id}`} className="badge-item">
                        <span>{entry.name}</span>
                        <strong>{entry.vote_count}</strong>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="muted">No superlatives recorded yet.</p>
              )}
            </section>
          </article>
        </div>
      )}
    </div>
  );
}

export function JoinBatchPage() {
  const { inviteCode, batchId } = useParams<{
    inviteCode?: string;
    batchId?: string;
  }>();

  if (batchId) {
    return <JoinBatchConfirmationPage batchId={batchId} />;
  }

  if (inviteCode) {
    return <PublicInviteBatchPage inviteCode={inviteCode} />;
  }

  return (
    <div className="page-shell onboarding-page">
      <section className="panel onboarding-shell">
        <header className="page-heading">
          <p className="eyebrow">Join yearbook</p>
          <h1>Invite missing</h1>
          <p>The invite link is incomplete.</p>
        </header>
        <div className="form-actions">
          <Link className="btn btn-primary" to="/explore">
            Explore yearbooks
          </Link>
        </div>
      </section>
    </div>
  );
}
