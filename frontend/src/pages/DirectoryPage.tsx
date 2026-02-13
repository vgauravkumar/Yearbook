import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  getApiErrorMessage,
  getApiErrorNumericField,
} from '../utils/errors';
import {
  formatBatchLabel,
  formatFreezeDate,
  isBatchFrozen,
  type BatchInfo,
} from '../utils/yearbook';

type SuperlativeVoteSummary = {
  id: string;
  name: string;
  vote_count: number;
};

type StudentTile = {
  id: string;
  full_name: string;
  profile_picture_url?: string;
  bio?: string;
  like_count: number;
  superlike_count: number;
  superlatives: SuperlativeVoteSummary[];
};

type SuperlativeDefinition = {
  id: string;
  name: string;
  max_votes: number;
  description?: string;
};

type MeResponse = {
  id: string;
  full_name: string;
  batch: (BatchInfo & { id: string }) | null;
};

type Notice = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

export function DirectoryPage() {
  const navigate = useNavigate();

  const [viewerId, setViewerId] = useState('');
  const [viewerName, setViewerName] = useState('');
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [students, setStudents] = useState<StudentTile[]>([]);
  const [superlatives, setSuperlatives] = useState<SuperlativeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [flippedStudentId, setFlippedStudentId] = useState<string | null>(null);
  const [votingKey, setVotingKey] = useState<string | null>(null);
  const [remainingVotesBySuperlative, setRemainingVotesBySuperlative] = useState<
    Record<string, number>
  >({});
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    async function loadDirectory() {
      try {
        const meResponse = await api.get('/api/v1/users/me');
        const me: MeResponse = meResponse.data;

        if (!me.batch) {
          navigate('/onboarding');
          return;
        }

        setViewerId(me.id);
        setViewerName(me.full_name);
        setBatch(me.batch);

        const [studentResponse, superlativeResponse] = await Promise.all([
          api.get(`/api/v1/batches/${me.batch.id}/students`, {
            params: { page: 1, limit: 50 },
          }),
          api.get('/api/v1/superlatives'),
        ]);

        setStudents(studentResponse.data.students ?? []);
        setSuperlatives(superlativeResponse.data.superlatives ?? []);
      } catch (errorValue: unknown) {
        setError(getApiErrorMessage(errorValue, 'Failed to load directory'));
      } finally {
        setLoading(false);
      }
    }

    loadDirectory();
  }, [navigate]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const frozen = useMemo(() => isBatchFrozen(batch), [batch]);
  const batchLabel = useMemo(() => formatBatchLabel(batch), [batch]);
  const freezeDateLabel = useMemo(() => formatFreezeDate(batch), [batch]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;

    return students.filter((student) => {
      const inName = student.full_name.toLowerCase().includes(query);
      const inBio = student.bio?.toLowerCase().includes(query) ?? false;
      return inName || inBio;
    });
  }, [search, students]);

  async function handleVote(studentId: string, superlativeId: string) {
    if (frozen) {
      setNotice({
        tone: 'info',
        message: `Voting is disabled because this batch froze on ${freezeDateLabel}.`,
      });
      return;
    }

    if (viewerId === studentId) {
      setNotice({
        tone: 'info',
        message: 'You cannot vote for yourself.',
      });
      return;
    }

    const key = `${studentId}:${superlativeId}`;
    setVotingKey(key);

    try {
      const response = await api.post(`/api/v1/superlatives/${superlativeId}/vote`, {
        to_user_id: studentId,
      });

      const remainingVotes =
        typeof response.data.remaining_votes === 'number'
          ? response.data.remaining_votes
          : undefined;

      if (remainingVotes !== undefined) {
        setRemainingVotesBySuperlative((previous) => ({
          ...previous,
          [superlativeId]: remainingVotes,
        }));
      }

      const superlativeName =
        superlatives.find((item) => item.id === superlativeId)?.name ?? 'Superlative';

      setStudents((previous) =>
        previous.map((student) => {
          if (student.id !== studentId) return student;

          const existing = student.superlatives.find(
            (entry) => entry.id === superlativeId,
          );

          if (existing) {
            return {
              ...student,
              superlatives: student.superlatives.map((entry) =>
                entry.id === superlativeId
                  ? { ...entry, vote_count: entry.vote_count + 1 }
                  : entry,
              ),
            };
          }

          return {
            ...student,
            superlatives: [
              ...student.superlatives,
              {
                id: superlativeId,
                name: superlativeName,
                vote_count: 1,
              },
            ],
          };
        }),
      );

      setNotice({
        tone: 'success',
        message: `Vote recorded for ${superlativeName}.`,
      });
    } catch (errorValue: unknown) {
      const maxVotes = getApiErrorNumericField(errorValue, 'max_votes');
      const usedVotes = getApiErrorNumericField(errorValue, 'votes_used');
      if (maxVotes !== null && usedVotes !== null && usedVotes >= maxVotes) {
        setRemainingVotesBySuperlative((previous) => ({
          ...previous,
          [superlativeId]: 0,
        }));
      }

      setNotice({
        tone: 'error',
        message: getApiErrorMessage(errorValue, 'Unable to submit vote'),
      });
    } finally {
      setVotingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="page-shell">
        <div className="loading-screen">Loading directory...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-shell">
        <section className="panel unauth-shell">
          <h1>Directory unavailable</h1>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
            Back home
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell directory-page">
      <header className="top-nav">
        <div className="brand-wrap">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>
            Back
          </button>
          <div>
            <p className="eyebrow">Directory</p>
            <h1>{batchLabel}</h1>
          </div>
        </div>

        <div className="nav-actions">
          <span className="user-chip">{viewerName}</span>
        </div>
      </header>

      <main className="directory-shell">
        <section className="panel directory-toolbar">
          <label className="field search-field">
            <span>Search classmates</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or bio"
            />
          </label>

          <div className="toolbar-meta">
            <span className="pill">{filteredStudents.length} students</span>
            <span className={`pill ${frozen ? 'frozen' : 'active'}`}>
              {frozen ? `Frozen on ${freezeDateLabel}` : 'Batch open'}
            </span>
          </div>
        </section>

        {notice && <p className={`inline-notice ${notice.tone}`}>{notice.message}</p>}

        <section className="directory-grid">
          {filteredStudents.map((student) => {
            const isFlipped = flippedStudentId === student.id;
            const voteMap = new Map(
              student.superlatives.map((item) => [item.id, item.vote_count]),
            );

            return (
              <article
                key={student.id}
                className={`year-card ${isFlipped ? 'is-flipped' : ''}`}
              >
                <div className="year-card-inner">
                  <section className="year-card-face year-card-front">
                    <button
                      type="button"
                      className="flip-trigger"
                      onClick={() => setFlippedStudentId(student.id)}
                      aria-label={`Show superlatives for ${student.full_name}`}
                    >
                      i
                    </button>

                    <button
                      type="button"
                      className="year-card-open"
                      onClick={() => navigate(`/profile/${student.id}`)}
                    >
                      <div className="avatar">
                        {student.profile_picture_url ? (
                          <img src={student.profile_picture_url} alt={student.full_name} />
                        ) : (
                          <span>{student.full_name.slice(0, 1)}</span>
                        )}
                      </div>
                      <h2>{student.full_name}</h2>
                      <p>{student.bio || 'No bio yet.'}</p>
                    </button>

                    <div className="tile-counts">
                      <span>Likes {student.like_count}</span>
                      <span>Superlikes {student.superlike_count}</span>
                    </div>
                  </section>

                  <section className="year-card-face year-card-back">
                    <div className="year-card-back-head">
                      <h3>Superlatives</h3>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setFlippedStudentId(null)}
                      >
                        Close
                      </button>
                    </div>

                    {superlatives.length > 0 ? (
                      <ul className="vote-list">
                        {superlatives.map((superlative) => {
                          const voteCount = voteMap.get(superlative.id) ?? 0;
                          const remainingVotes =
                            remainingVotesBySuperlative[superlative.id];
                          const isOutOfVotes = remainingVotes === 0;
                          const isVoting =
                            votingKey === `${student.id}:${superlative.id}`;

                          let voteLabel = 'Vote';
                          if (isVoting) voteLabel = 'Voting...';
                          else if (isOutOfVotes) voteLabel = 'No votes left';
                          else if (remainingVotes !== undefined)
                            voteLabel = `Vote (${remainingVotes} left)`;

                          return (
                            <li key={`${student.id}-${superlative.id}`} className="vote-row">
                              <div>
                                <p className="vote-title">{superlative.name}</p>
                                <p className="vote-meta">{voteCount} votes on this profile</p>
                              </div>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleVote(student.id, superlative.id)}
                                disabled={frozen || isOutOfVotes || isVoting}
                              >
                                {voteLabel}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="muted">No superlatives are active yet.</p>
                    )}

                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      onClick={() => navigate(`/profile/${student.id}`)}
                    >
                      View profile
                    </button>
                  </section>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
