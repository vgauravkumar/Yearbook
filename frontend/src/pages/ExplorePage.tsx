import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { getApiErrorMessage } from '../utils/errors';

type PublicBatchCard = {
  _id: string;
  institutionName: string;
  graduationYear: number;
  graduationMonth: string;
  memberCount: number;
  isFrozen: boolean;
  freezeDate?: string | null;
  inviteCode: string;
  previewAvatars: string[];
  updatedAt?: string | null;
};

type PublicBatchesResponse = {
  batches?: PublicBatchCard[];
};

export function ExplorePage() {
  const [query, setQuery] = useState('');
  const [batches, setBatches] = useState<PublicBatchCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBatches() {
      try {
        const response = await api.get<PublicBatchesResponse>('/api/v1/batches/public');
        if (cancelled) return;
        setBatches(response.data.batches ?? []);
      } catch (errorValue: unknown) {
        if (!cancelled) {
          setError(getApiErrorMessage(errorValue, 'Unable to load public yearbooks'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadBatches();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBatches = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return batches;
    }

    return batches.filter((batch) =>
      batch.institutionName.toLowerCase().includes(normalizedQuery),
    );
  }, [batches, query]);

  const emptyBySearch = batches.length > 0 && filteredBatches.length === 0;

  return (
    <div className="page-shell explore-page">
      <header className="top-nav">
        <div className="brand-wrap">
          <span className="brand-mark">YB</span>
          <div>
            <p className="eyebrow">Digital Yearbook</p>
            <h1>Explore Yearbooks</h1>
          </div>
        </div>
        <div className="nav-actions">
          <Link className="btn btn-ghost" to="/">
            Back to landing
          </Link>
          <Link className="btn btn-primary" to="/auth?mode=signup">
            Build my yearbook
          </Link>
        </div>
      </header>

      <main className="explore-shell">
        <section className="panel explore-header">
          <div>
            <h2>Explore Yearbooks</h2>
            <p>Browse graduating classes from colleges across the country.</p>
          </div>

          <label className="field explore-search">
            <span>Search by institution</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type college or university name"
            />
          </label>
        </section>

        {loading && (
          <section className="panel">
            <div className="loading-screen">Loading yearbooks...</div>
          </section>
        )}

        {!loading && error && (
          <section className="panel unauth-shell">
            <h2>Couldn&apos;t load yearbooks</h2>
            <p>{error}</p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          </section>
        )}

        {!loading && !error && batches.length === 0 && (
          <section className="panel explore-empty">
            <h2>No yearbooks yet. Be the first to build one.</h2>
            <Link className="btn btn-primary" to="/auth?mode=signup">
              Build my yearbook
            </Link>
          </section>
        )}

        {!loading && !error && emptyBySearch && (
          <section className="panel explore-empty">
            <h2>No matching yearbooks</h2>
            <p>Try a different institution name.</p>
          </section>
        )}

        {!loading && !error && filteredBatches.length > 0 && (
          <section className="explore-grid">
            {filteredBatches.map((batch) => (
              <article key={batch._id} className="panel explore-card">
                <div className="explore-card-head">
                  <h3>{batch.institutionName}</h3>
                  {batch.isFrozen && <span className="pill frozen">Frozen</span>}
                </div>

                <p className="muted">
                  {batch.graduationMonth} {batch.graduationYear}
                </p>

                <div className="toolbar-meta">
                  <span className="pill">{batch.memberCount} members</span>
                  {batch.isFrozen && batch.freezeDate && (
                    <span className="pill">Frozen on {new Date(batch.freezeDate).toLocaleDateString()}</span>
                  )}
                </div>

                <div className="explore-avatar-stack" aria-label="Member previews">
                  {batch.previewAvatars.length > 0 ? (
                    batch.previewAvatars.slice(0, 4).map((avatarUrl, index) => (
                      <span
                        key={`${batch._id}-avatar-${index}`}
                        className="explore-avatar"
                        style={{ zIndex: 4 - index }}
                      >
                        <img src={avatarUrl} alt="" />
                      </span>
                    ))
                  ) : (
                    <span className="muted explore-no-avatars">No profile photos yet</span>
                  )}
                </div>

                <Link className="btn btn-secondary explore-view-link" to={`/join/${batch.inviteCode}`}>
                  View yearbook
                </Link>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
