import axios from 'axios';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { getApiErrorMessage } from '../utils/errors';
import { MONTH_NAMES } from '../utils/yearbook';

type BatchSearchResult = {
  id: string;
  institution_name: string;
  graduation_year: number;
  graduation_month: string;
  member_count: number;
  is_frozen?: boolean;
};

type MeBatchResponse = {
  batch: { id: string } | null;
};

type BatchCreateResponse = {
  batch: {
    id: string;
    invite_code?: string;
  };
};
type MonthName = (typeof MONTH_NAMES)[number];

function normalizeInstitution(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshteinDistance(left: string, right: string): number {
  const source = normalizeInstitution(left);
  const target = normalizeInstitution(right);

  if (!source) return target.length;
  if (!target) return source.length;

  const matrix = Array.from({ length: source.length + 1 }, () =>
    new Array(target.length + 1).fill(0),
  );

  for (let row = 0; row <= source.length; row += 1) matrix[row][0] = row;
  for (let col = 0; col <= target.length; col += 1) matrix[0][col] = col;

  for (let row = 1; row <= source.length; row += 1) {
    for (let col = 1; col <= target.length; col += 1) {
      const cost = source[row - 1] === target[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[source.length][target.length];
}

function isCloseInstitutionMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeInstitution(left);
  const normalizedRight = normalizeInstitution(right);

  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return true;
  }

  return levenshteinDistance(normalizedLeft, normalizedRight) <= 2;
}

function getDefaultGraduationMonth(): MonthName {
  return (MONTH_NAMES[new Date().getMonth()] ?? 'June') as MonthName;
}

export function OnboardingPage() {
  const navigate = useNavigate();

  const [institutionName, setInstitutionName] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<MonthName>(getDefaultGraduationMonth());
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<BatchSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [createWarning, setCreateWarning] = useState<BatchSearchResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autocompleteRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function initializeOnboarding() {
      const token = localStorage.getItem('access_token');
      if (!token) {
        navigate('/auth?mode=signup&next=/onboard', { replace: true });
        return;
      }

      try {
        const response = await api.get<MeBatchResponse>('/api/v1/users/me/batch');
        if (response.data.batch) {
          navigate('/app', { replace: true });
          return;
        }
      } catch (errorValue: unknown) {
        if (axios.isAxiosError(errorValue) && errorValue.response?.status === 401) {
          localStorage.removeItem('access_token');
          navigate('/auth?mode=signup&next=/onboard', { replace: true });
          return;
        }
      }

      setReady(true);
    }

    initializeOnboarding();
  }, [navigate]);

  useEffect(() => {
    if (!ready) return;

    const query = institutionName.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await api.get('/api/v1/batches/search', {
          params: { q: query },
        });

        if (!cancelled) {
          setSearchResults(response.data.batches ?? []);
        }
      } catch {
        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [institutionName, ready]);

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

  const matchingCohort = useMemo(
    () =>
      searchResults.filter(
        (result) => result.graduation_year === year && result.graduation_month === month,
      ),
    [month, searchResults, year],
  );

  const closeMatch = useMemo(() => {
    const trimmedInstitution = institutionName.trim();
    if (!trimmedInstitution) {
      return null;
    }

    return (
      matchingCohort.find((result) =>
        isCloseInstitutionMatch(result.institution_name, trimmedInstitution),
      ) ?? null
    );
  }, [institutionName, matchingCohort]);

  async function submitCreateBatch(forceCreate: boolean) {
    const trimmedInstitution = institutionName.trim();

    if (!trimmedInstitution) {
      setError('Institution name is required.');
      return;
    }

    if (year < 2000 || year > 2100) {
      setError('Graduation year must be between 2000 and 2100.');
      return;
    }

    if (!forceCreate && closeMatch) {
      setCreateWarning(closeMatch);
      setError(null);
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await api.post<BatchCreateResponse>('/api/v1/batches', {
        institutionName: trimmedInstitution,
        graduationYear: year,
        graduationMonth: month,
        forceCreate,
      });

      const createdBatch = response.data.batch;
      if (createdBatch?.id && createdBatch?.invite_code) {
        localStorage.setItem(
          'yearbook:pending_invite_modal',
          JSON.stringify({
            batchId: createdBatch.id,
            inviteCode: createdBatch.invite_code,
          }),
        );
      }

      navigate('/app', { replace: true });
    } catch (errorValue: unknown) {
      if (axios.isAxiosError(errorValue) && errorValue.response?.data) {
        const payload = errorValue.response.data as {
          warning_code?: string;
          suggested_batch?: BatchSearchResult;
        };

        if (
          payload.warning_code === 'similar_batch_exists' &&
          payload.suggested_batch?.id
        ) {
          setCreateWarning(payload.suggested_batch);
          setCreating(false);
          return;
        }
      }

      setError(getApiErrorMessage(errorValue, 'Unable to create batch'));
    } finally {
      setCreating(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCreateBatch(false);
  }

  if (!ready) {
    return (
      <div className="page-shell onboarding-page">
        <div className="loading-screen">Preparing onboarding...</div>
      </div>
    );
  }

  return (
    <div className="page-shell onboarding-page">
      <section className="panel onboarding-shell">
        <header className="page-heading">
          <p className="eyebrow">Onboarding</p>
          <h1>Set your graduation batch</h1>
          <p>
            Search for your existing batch first. If it does not exist, create it and
            share your invite link.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="stack-form">
          <div className="autocomplete" ref={autocompleteRef}>
            <label className="field">
              <span>Institution</span>
              <input
                value={institutionName}
                onFocus={() => setShowDropdown(true)}
                onChange={(event) => {
                  setInstitutionName(event.target.value);
                  setCreateWarning(null);
                  setError(null);
                  setShowDropdown(true);
                }}
                placeholder="Search your school"
                autoComplete="off"
                required
              />
            </label>

            {showDropdown && institutionName.trim().length >= 2 && (
              <div className="autocomplete-list" role="listbox">
                {searchLoading && <p className="autocomplete-empty">Searching batches...</p>}

                {!searchLoading && searchResults.length > 0 &&
                  searchResults.map((batch) => {
                    const label = `${batch.institution_name} — ${batch.graduation_month} ${batch.graduation_year}`;
                    const detail = `${batch.member_count} members`;
                    return (
                      <button
                        key={batch.id}
                        type="button"
                        className="autocomplete-item"
                        disabled={Boolean(batch.is_frozen)}
                        onClick={() => {
                          navigate(`/join/batch/${batch.id}`);
                        }}
                      >
                        <span className="batch-result-primary">{label}</span>
                        <span className="batch-result-secondary">
                          {detail}
                          {batch.is_frozen ? ' · Frozen' : ''}
                        </span>
                      </button>
                    );
                  })}

                {!searchLoading && searchResults.length === 0 && (
                  <p className="autocomplete-empty">
                    No existing batch found. Create yours below.
                  </p>
                )}
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
                max={2100}
                onChange={(event) => {
                  setYear(Number(event.target.value));
                  setCreateWarning(null);
                  setError(null);
                }}
              />
            </label>

            <label className="field">
              <span>Graduation month</span>
              <select
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value as MonthName);
                  setCreateWarning(null);
                  setError(null);
                }}
              >
                {MONTH_NAMES.map((monthName) => (
                  <option key={monthName} value={monthName}>
                    {monthName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {createWarning && (
            <div className="inline-notice info onboarding-warning">
              <p>
                A batch named '{createWarning.institution_name}' already exists for{' '}
                {createWarning.graduation_month} {createWarning.graduation_year} ({' '}
                {createWarning.member_count} members). Did you mean to join that instead?
              </p>
              <div className="onboarding-warning-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/join/batch/${createWarning.id}`)}
                >
                  Join existing
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => submitCreateBatch(true)}
                  disabled={creating}
                >
                  No, create new
                </button>
              </div>
            </div>
          )}

          {error && <p className="inline-notice error">{error}</p>}

          <div className="form-actions">
            <button type="submit" disabled={creating} className="btn btn-primary btn-block">
              {creating ? 'Creating batch...' : 'Create & Enter Yearbook'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
