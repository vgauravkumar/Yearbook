import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { getApiErrorMessage } from '../utils/errors';
import { MONTH_NAMES } from '../utils/yearbook';

type Institution = {
  id: string;
  name: string;
};

export function OnboardingPage() {
  const navigate = useNavigate();

  const [allInstitutions, setAllInstitutions] = useState<Institution[]>([]);
  const [search, setSearch] = useState('');
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const autocompleteRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadAllInstitutions() {
      try {
        const response = await api.get('/api/v1/institutions');
        setAllInstitutions(response.data.institutions ?? []);
      } catch {
        setAllInstitutions([]);
      }
    }

    loadAllInstitutions();
  }, []);

  useEffect(() => {
    function closeWhenClickingOutside(event: MouseEvent) {
      const target = event.target;
      if (!target || !(target instanceof Node)) return;
      if (!autocompleteRef.current?.contains(target)) {
        setShowDropdown(false);
      }
    }

    window.addEventListener('mousedown', closeWhenClickingOutside);
    return () => window.removeEventListener('mousedown', closeWhenClickingOutside);
  }, []);

  const selectedInstitution = allInstitutions.find(
    (institution) => institution.id === selectedInstitutionId,
  );

  const institutionInputValue = selectedInstitution ? selectedInstitution.name : search;

  const filteredInstitutions = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const source = normalized
      ? allInstitutions.filter((institution) =>
          institution.name.toLowerCase().includes(normalized),
        )
      : allInstitutions;

    return source.slice(0, 50);
  }, [allInstitutions, search]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const institutionName = search.trim();
    if (!selectedInstitutionId && !institutionName) {
      setError('Choose an institution or enter a custom institution name.');
      setLoading(false);
      return;
    }

    if (year < 2000 || year > 2050) {
      setError('Graduation year must be between 2000 and 2050.');
      setLoading(false);
      return;
    }

    try {
      await api.post('/api/v1/users/onboard', {
        institution_id: selectedInstitutionId || undefined,
        institution_name: selectedInstitutionId ? undefined : institutionName,
        graduation_year: year,
        graduation_month: month,
      });
      navigate('/profile/edit');
    } catch (errorValue: unknown) {
      setError(getApiErrorMessage(errorValue, 'Something went wrong'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-shell onboarding-page">
      <section className="panel onboarding-shell">
        <header className="page-heading">
          <p className="eyebrow">Onboarding</p>
          <h1>Set your graduation batch</h1>
          <p>
            You will be grouped with students from the same institution and
            graduation month.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="stack-form">
          <div className="autocomplete" ref={autocompleteRef}>
            <label className="field">
              <span>Institution</span>
              <input
                value={institutionInputValue}
                onFocus={() => setShowDropdown(true)}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelectedInstitutionId('');
                  setShowDropdown(true);
                }}
                placeholder="Search your school or type a new name"
                autoComplete="off"
                required={!selectedInstitutionId}
              />
            </label>

            {showDropdown && (
              <div className="autocomplete-list" role="listbox">
                {filteredInstitutions.length > 0 ? (
                  filteredInstitutions.map((institution) => (
                    <button
                      key={institution.id}
                      type="button"
                      className="autocomplete-item"
                      onClick={() => {
                        setSelectedInstitutionId(institution.id);
                        setSearch(institution.name);
                        setShowDropdown(false);
                      }}
                    >
                      {institution.name}
                    </button>
                  ))
                ) : (
                  <p className="autocomplete-empty">No exact match. Use custom name below.</p>
                )}

                <button
                  type="button"
                  className="autocomplete-item custom"
                  onClick={() => {
                    setSelectedInstitutionId('');
                    setShowDropdown(false);
                  }}
                >
                  Use custom institution name
                </button>
              </div>
            )}
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Graduation year</span>
              <input
                type="number"
                value={year}
                min={2000}
                max={2050}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </label>

            <label className="field">
              <span>Graduation month</span>
              <select
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
              >
                {MONTH_NAMES.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>
                    {monthName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="inline-notice error">{error}</p>}

          <div className="form-actions">
            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? 'Saving your batch...' : 'Enter yearbook'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
