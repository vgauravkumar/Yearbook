import { useEffect, useState } from 'react';
import { api } from '../api/client';

type MeResponse = {
  full_name: string;
  email: string;
  has_completed_onboarding: boolean;
};

export function HomePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/api/v1/users/me');
        const data = res.data;
        setMe(data);
        if (!data.has_completed_onboarding) {
          window.location.href = '/onboarding';
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
        <a href="/auth">Go to login/signup</a>
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
        <button onClick={() => (window.location.href = '/directory')}>
          Open Directory
        </button>
      </main>
    </div>
  );
}

