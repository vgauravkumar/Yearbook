import axios from 'axios';

type ErrorPayload = {
  error?: unknown;
  max_votes?: unknown;
  votes_used?: unknown;
};

function parsePayload(error: unknown): ErrorPayload | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data;
  if (data && typeof data === 'object') {
    return data as ErrorPayload;
  }
  return null;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const payload = parsePayload(error);
  if (payload && typeof payload.error === 'string') {
    return payload.error;
  }
  return fallback;
}

export function getApiErrorNumericField(
  error: unknown,
  field: 'max_votes' | 'votes_used',
): number | null {
  const payload = parsePayload(error);
  if (!payload) return null;
  const value = payload[field];
  return typeof value === 'number' ? value : null;
}
