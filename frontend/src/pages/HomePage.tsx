import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

type MeResponse = {
  full_name: string;
  email: string;
  has_completed_onboarding: boolean;
};

export function HomePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/api/v1/users/me');
        const data = res.data;
        setMe(data);
        if (!data.has_completed_onboarding) {
          navigate('/onboarding');
          return;
        }
      } catch {
        // Not logged in
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <p className="center">Loading...</p>;
  }

  if (!me) {
    return (
      <div className="center">
        <p>You are not logged in.</p>
        <Link to="/auth">Go to login/signup</Link>
      </div>
    );
  }

  return (
    <div className="home">
      <header className="top-bar">
        <h1>Yearbook</h1>
        <div className="user-pill">{me.full_name}</div>
      </header>
      <main>
        <h2>Welcome to your Yearbook</h2>
        <p>Jump into your batch directory to see everyone.</p>
        <div className="primary-actions">
          <button onClick={() => navigate('/directory')}>
            Open Directory
          </button>
          <button onClick={() => navigate('/profile/edit')}>
            Edit My Profile
          </button>
        </div>
      </main>
    </div>
  );
}

