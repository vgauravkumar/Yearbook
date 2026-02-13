import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

type SessionResponse = {
  has_completed_onboarding: boolean;
};

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1100&q=80',
  'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1100&q=80',
  'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1100&q=80',
  'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1100&q=80',
];

export function HomePage() {
  const navigate = useNavigate();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function routeAuthenticatedUsers() {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setCheckingSession(false);
        return;
      }

      try {
        const response = await api.get('/api/v1/users/me');
        const session: SessionResponse = response.data;

        if (session.has_completed_onboarding) {
          navigate('/app', { replace: true });
        } else {
          navigate('/onboarding', { replace: true });
        }
      } catch {
        localStorage.removeItem('access_token');
        setCheckingSession(false);
      }
    }

    routeAuthenticatedUsers();
  }, [navigate]);

  if (checkingSession) {
    return (
      <div className="page-shell landing-page">
        <div className="loading-screen">Loading yearbook...</div>
      </div>
    );
  }

  return (
    <div className="page-shell landing-page">
      <header className="landing-nav panel">
        <div className="brand-wrap">
          <span className="brand-mark">YB</span>
          <div>
            <p className="eyebrow">Digital Yearbook</p>
            <h1>Campus memories, remixed.</h1>
          </div>
        </div>

        <div className="nav-actions">
          <Link className="btn btn-ghost" to="/auth">
            Log in
          </Link>
          <Link className="btn btn-primary" to="/auth">
            Start now
          </Link>
        </div>
      </header>

      <main className="landing-shell">
        <section className="panel landing-hero">
          <div className="landing-copy">
            <p className="eyebrow">Gen Z Yearbook Experience</p>
            <h2>Not a dusty PDF. A living memory feed for your class.</h2>
            <p>
              Discover batchmates, react in real time, pin your favorites, and explore
              your class pulse in one app.
            </p>
            <div className="landing-cta-row">
              <Link className="btn btn-primary" to="/auth">
                Build my yearbook
              </Link>
              <Link className="btn btn-secondary" to="/auth">
                See live campus hub
              </Link>
            </div>
            <div className="landing-metrics">
              <div>
                <strong>Instant Profiles</strong>
                <span>Scroll, react, and discover from one screen.</span>
              </div>
              <div>
                <strong>Class Pulse</strong>
                <span>Leaderboards and superlatives auto-updated.</span>
              </div>
              <div>
                <strong>Bookmarks</strong>
                <span>Pin people and write your own private notes.</span>
              </div>
            </div>
          </div>

          <div className="landing-visual-grid">
            {HERO_IMAGES.map((imageUrl, index) => (
              <article key={imageUrl} className={`landing-shot shot-${index + 1}`}>
                <img src={imageUrl} alt="Students on campus" loading="lazy" />
              </article>
            ))}
          </div>
        </section>

        <section className="landing-flow-grid">
          <article className="panel flow-card">
            <p className="eyebrow">Step 1</p>
            <h3>Join your batch</h3>
            <p>Log in, choose your institution, and get matched with your graduating crew.</p>
          </article>
          <article className="panel flow-card">
            <p className="eyebrow">Step 2</p>
            <h3>Enter the hub</h3>
            <p>Discover cards, vote for superlatives, and react without changing pages.</p>
          </article>
          <article className="panel flow-card">
            <p className="eyebrow">Step 3</p>
            <h3>Keep your archive</h3>
            <p>Save bookmarks, personal notes, and class momentum in one memory lane.</p>
          </article>
        </section>

        <section className="panel landing-dev-cta">
          <p className="eyebrow">Built with intent</p>
          <h3>Want to know the developer behind this product?</h3>
          <p>Explore the full profile, experience timeline, and projects.</p>
          <Link className="btn btn-secondary" to="/resume">
            Know about the developer
          </Link>
        </section>
      </main>
    </div>
  );
}
