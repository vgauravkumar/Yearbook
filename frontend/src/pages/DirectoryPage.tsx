import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

type StudentTile = {
  id: string;
  full_name: string;
  profile_picture_url?: string;
  like_count: number;
  superlike_count: number;
};

type MeBatch = {
  id: string;
};

export function DirectoryPage() {
  const [students, setStudents] = useState<StudentTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const me = await api.get('/api/v1/users/me');
        const batch: MeBatch | null = me.data.batch;
        if (!batch) {
          navigate('/onboarding');
          return;
        }
        const res = await api.get(`/api/v1/batches/${batch.id}/students`, {
          params: { page: 1, limit: 50 },
        });
        setStudents(res.data.students ?? []);
      } catch (err: any) {
        setError(err.response?.data?.error ?? 'Failed to load directory');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="center">Loading directory...</p>;
  if (error) return <p className="center">{error}</p>;

  return (
    <div className="home">
      <header className="top-bar">
        <button
          type="button"
          className="back-button"
          onClick={() => navigate('/')}
        >
          ← Back
        </button>
        <h1>Yearbook</h1>
      </header>
      <main>
        <h2>Your Batchmates</h2>
        <div className="grid">
          {students.map((s) => (
                <button
                  key={s.id}
                  className="tile"
                  onClick={() => navigate(`/profile/${s.id}`)}
                >
              <div className="avatar">
                {s.profile_picture_url ? (
                  <img src={s.profile_picture_url} alt={s.full_name} />
                ) : (
                  <span>{s.full_name[0]}</span>
                )}
              </div>
              <div className="tile-name">{s.full_name}</div>
              <div className="tile-counts">
                <span>❤️ {s.like_count}</span>
                <span>🌟 {s.superlike_count}</span>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

