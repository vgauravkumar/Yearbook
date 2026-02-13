import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

type Institution = { id: string; name: string };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function OnboardingPage() {
  const [allInstitutions, setAllInstitutions] = useState<Institution[]>([]);
  const [filteredInstitutions, setFilteredInstitutions] = useState<Institution[]>([]);
  const [search, setSearch] = useState('');
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();

  // Load all institutions on component mount
  useEffect(() => {
    async function loadAllInstitutions() {
      try {
        const res = await api.get('/api/v1/institutions');
        setAllInstitutions(res.data.institutions ?? []);
      } catch {
        // ignore
      }
    }
    loadAllInstitutions();
  }, []);

  // Filter institutions based on search input
  useEffect(() => {
    if (!search) {
      setFilteredInstitutions(allInstitutions);
      return;
    }

    const filtered = allInstitutions.filter((inst) =>
      inst.name.toLowerCase().includes(search.toLowerCase())
    );
    setFilteredInstitutions(filtered);
  }, [search, allInstitutions]);

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
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const selectedInstitution = allInstitutions.find(
    (inst) => inst.id === selectedInstitutionId
  );

  return (
    <div className="auth-container">
      <h1>Yearbook Onboarding</h1>
      <div className="auth-card">
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Institution</label>
            <div style={{ position: 'relative' }}>
              <input
                value={selectedInstitution ? selectedInstitution.name : search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedInstitutionId('');
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                placeholder="Click to see universities..."
                autoComplete="off"
              />
              {showDropdown && allInstitutions.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000,
                  }}
                >
                  {filteredInstitutions.map((inst) => (
                    <div
                      key={inst.id}
                      onClick={() => {
                        setSelectedInstitutionId(inst.id);
                        setSearch(inst.name);
                        setShowDropdown(false);
                      }}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #333',
                        hover: { backgroundColor: '#2a2a2a' },
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#2a2a2a';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {inst.name}
                    </div>
                  ))}
                  <div
                    onClick={() => {
                      setSelectedInstitutionId('');
                      setShowDropdown(false);
                    }}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontStyle: 'italic',
                      color: '#999',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#2a2a2a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    Other (Enter manually)
                  </div>
                </div>
              )}
            </div>
            {selectedInstitutionId === '' && search && (
              <p style={{ fontSize: '0.9em', color: '#666', marginTop: '4px' }}>
                Enter your university name or select from the list
              </p>
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
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((monthName, index) => (
                <option key={index} value={index + 1}>
                  {monthName}
                </option>
              ))}
            </select>
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

