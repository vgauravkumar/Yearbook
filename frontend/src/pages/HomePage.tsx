import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { getApiErrorMessage } from '../utils/errors';
import { formatBatchLabel, formatFreezeDate, isBatchFrozen, type BatchInfo } from '../utils/yearbook';

type MeResponse = {
  id: string;
  full_name: string;
  email: string;
  has_completed_onboarding: boolean;
  batch: BatchInfo | null;
};

export function HomePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const response = await api.get('/api/v1/users/me');
        const user: MeResponse = response.data;
        setMe(user);

        if (!user.has_completed_onboarding) {
          navigate('/onboarding');
        }
      } catch (errorValue: unknown) {
        setError(getApiErrorMessage(errorValue, 'Unable to load your account'));
      } finally {
        setLoading(false);
      }
    }

    loadCurrentUser();
  }, [navigate]);

  const batchLabel = useMemo(() => formatBatchLabel(me?.batch ?? null), [me?.batch]);
  const frozen = useMemo(() => isBatchFrozen(me?.batch ?? null), [me?.batch]);
  const freezeDateLabel = useMemo(() => formatFreezeDate(me?.batch ?? null), [me?.batch]);

  function handleLogout() {
    localStorage.removeItem('access_token');
    navigate('/auth');
  }

  if (loading) {
    return (
      <div className="page-shell">
        <div className="loading-screen">Loading your yearbook...</div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="page-shell">
        <section className="panel unauth-shell">
          <h1>Welcome to Yearbook</h1>
          <p>{error ?? 'You need to log in to open your batch.'}</p>
          <Link className="btn btn-primary" to="/auth">
            Go to login
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell home-page">
      <header className="top-nav">
        <div className="brand-wrap">
          <span className="brand-mark">YB</span>
          <div>
            <p className="eyebrow">Digital Yearbook</p>
            <h1>Home</h1>
          </div>
        </div>

        <div className="nav-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate('/profile/edit')}
          >
            Edit profile
          </button>
          <button type="button" className="btn btn-danger" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="home-grid">
        <section className="panel hero-panel">
          <p className="eyebrow">Hey {me.full_name.split(' ')[0]}</p>
          <h2>Your class memories, all in one timeline.</h2>
          <p>
            Browse your classmates, react to profiles, and keep the yearbook alive
            until your batch freeze date.
          </p>

          <div className="home-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/directory')}
            >
              Open directory
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/profile/edit')}
            >
              Update my profile
            </button>
          </div>
        </section>

        <section className="panel home-metrics">
          <div className="metric-card">
            <p className="metric-label">Batch</p>
            <p className="metric-value">{batchLabel}</p>
          </div>
          <div className="metric-card">
            <p className="metric-label">Profile status</p>
            <p className="metric-value">{frozen ? 'Frozen' : 'Active'}</p>
          </div>
          <div className="metric-card">
            <p className="metric-label">Freeze date</p>
            <p className="metric-value">{freezeDateLabel}</p>
          </div>
          {frozen && (
            <p className="inline-notice info">
              Your batch is frozen. Viewing is still available, but new interactions
              and profile edits are disabled.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
