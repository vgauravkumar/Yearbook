import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { getApiErrorMessage } from '../utils/errors';

type Mode = 'login' | 'register';

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === 'register') {
        await api.post('/api/v1/auth/register', {
          email,
          password,
          full_name: fullName,
        });
        setMode('login');
        setNotice('Account created. Log in with your credentials to continue.');
      } else {
        const response = await api.post('/api/v1/auth/login', { email, password });
        localStorage.setItem('access_token', response.data.access_token);
        navigate('/');
      }
    } catch (errorValue: unknown) {
      setError(getApiErrorMessage(errorValue, 'Something went wrong'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-shell auth-page">
      <div className="auth-layout">
        <section className="panel auth-hero">
          <p className="eyebrow">Digital Yearbook</p>
          <h1>Save your class memories in one place.</h1>
          <p>
            Build your profile, react to classmates, vote for superlatives, and
            lock the moment when graduation is over.
          </p>
          <div className="hero-points">
            <span>Batch-only community</span>
            <span>Superlative voting</span>
            <span>Time-capsule freeze</span>
          </div>
        </section>

        <section className="panel auth-panel">
          <div className="auth-headline">
            <span className="brand-mark">YB</span>
            <div>
              <h2>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
              <p>
                {mode === 'register'
                  ? 'Start with your student identity.'
                  : 'Log in to enter your yearbook.'}
              </p>
            </div>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'register' ? 'is-active' : ''}
              onClick={() => setMode('register')}
              role="tab"
              aria-selected={mode === 'register'}
            >
              Sign up
            </button>
            <button
              type="button"
              className={mode === 'login' ? 'is-active' : ''}
              onClick={() => setMode('login')}
              role="tab"
              aria-selected={mode === 'login'}
            >
              Log in
            </button>
          </div>

          <form onSubmit={handleSubmit} className="stack-form">
            {mode === 'register' && (
              <label className="field">
                <span>Full name</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                  maxLength={100}
                  placeholder="Ava Johnson"
                />
              </label>
            )}

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="you@campus.edu"
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                placeholder="At least 6 characters"
              />
            </label>

            {notice && <p className="inline-notice success">{notice}</p>}
            {error && <p className="inline-notice error">{error}</p>}

            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading
                ? 'Please wait...'
                : mode === 'register'
                  ? 'Create account'
                  : 'Continue'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
