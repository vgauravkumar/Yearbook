import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { getApiErrorMessage } from '../utils/errors';
import { formatFreezeDate, type BatchInfo } from '../utils/yearbook';

type BatchPayload = BatchInfo & {
  id: string;
  member_count: number;
};

type BatchResponse = {
  batch: BatchPayload;
};

export function JoinBatchPage() {
  const navigate = useNavigate();
  const { inviteCode, batchId } = useParams<{
    inviteCode?: string;
    batchId?: string;
  }>();

  const [batch, setBatch] = useState<BatchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const batchLabel = useMemo(() => {
    if (!batch) return '';
    return `${batch.institution_name ?? 'Unknown institution'} — ${batch.graduation_month} ${batch.graduation_year}`;
  }, [batch]);

  const freezeDateLabel = useMemo(() => formatFreezeDate(batch), [batch]);

  useEffect(() => {
    async function loadBatch() {
      const token = localStorage.getItem('access_token');

      if (!token) {
        if (inviteCode) {
          navigate(`/auth?mode=signup&next=/join/${inviteCode}`, { replace: true });
        } else if (batchId) {
          navigate(`/auth?mode=signup&next=/join/batch/${batchId}`, { replace: true });
        } else {
          navigate('/onboard', { replace: true });
        }
        return;
      }

      try {
        const response = inviteCode
          ? await api.get<BatchResponse>(`/api/v1/batches/join/${inviteCode}`)
          : await api.get<BatchResponse>(`/api/v1/batches/${batchId}`);

        setBatch(response.data.batch);
      } catch (errorValue: unknown) {
        if (axios.isAxiosError(errorValue) && errorValue.response?.status === 401) {
          localStorage.removeItem('access_token');
          if (inviteCode) {
            navigate(`/auth?mode=signup&next=/join/${inviteCode}`, { replace: true });
            return;
          }
        }

        setError(getApiErrorMessage(errorValue, 'Unable to load batch details'));
      } finally {
        setLoading(false);
      }
    }

    loadBatch();
  }, [batchId, inviteCode, navigate]);

  async function handleJoinBatch() {
    if (!batch?.id) return;

    setJoining(true);
    setError(null);

    try {
      await api.post(`/api/v1/batches/${batch.id}/join`);
      navigate('/app', { replace: true });
    } catch (errorValue: unknown) {
      setError(getApiErrorMessage(errorValue, 'Unable to join this yearbook'));
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="page-shell onboarding-page">
        <div className="loading-screen">Loading batch details...</div>
      </div>
    );
  }

  if (!batch || error) {
    return (
      <div className="page-shell onboarding-page">
        <section className="panel onboarding-shell">
          <header className="page-heading">
            <p className="eyebrow">Join yearbook</p>
            <h1>Batch unavailable</h1>
            <p>{error ?? 'This invite does not match any batch.'}</p>
          </header>

          <div className="form-actions">
            <Link className="btn btn-primary btn-block" to="/onboard">
              Back to onboarding
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell onboarding-page">
      <section className="panel onboarding-shell join-shell">
        <header className="page-heading">
          <p className="eyebrow">Join yearbook</p>
          <h1>You're joining:</h1>
          <p className="join-batch-label">{batchLabel}</p>
          <p>{batch.member_count} members already in</p>
        </header>

        {batch.is_frozen ? (
          <p className="inline-notice error">
            This yearbook has been frozen as of {freezeDateLabel}. You can view it but
            cannot create a profile or interact.
          </p>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleJoinBatch}
            disabled={joining}
          >
            {joining ? 'Joining...' : 'Join this yearbook'}
          </button>
        )}

        {error && <p className="inline-notice error">{error}</p>}

        <div className="form-actions">
          <Link className="btn btn-ghost btn-block" to="/onboard">
            Go back
          </Link>
        </div>
      </section>
    </div>
  );
}
