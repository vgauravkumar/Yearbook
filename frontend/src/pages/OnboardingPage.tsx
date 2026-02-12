import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';

type Institution = { id: string; name: string };

export function OnboardingPage() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [search, setSearch] = useState('');
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function searchInstitutions() {
      if (!search) {
        setInstitutions([]);
        return;
      }
      try {
        const res = await api.get('/api/v1/institutions/search', {
          params: { query: search },
        });
        setInstitutions(res.data.institutions ?? []);
      } catch {
        // ignore
      }
    }
    const id = setTimeout(searchInstitutions, 300);
    return () => clearTimeout(id);
  }, [search]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/v1/users/onboard', {
        institution_id: selectedInstitutionId || undefined,
        institution_name: search,
        graduation_year: year,
        graduation_month: month,
      });
      window.location.href = '/';
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <h1>Yearbook Onboarding</h1>
      <div className="auth-card">
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Institution</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search institution..."
            />
            {institutions.length > 0 && (
              <select
                value={selectedInstitutionId}
                onChange={(e) => setSelectedInstitutionId(e.target.value)}
              >
                <option value="">Select institution</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="field">
            <label>Graduation year</label>
            <input
              type="number"
              value={year}
              min={2000}
              max={2050}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Graduation month</label>
            <input
              type="number"
              value={month}
              min={1}
              max={12}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

