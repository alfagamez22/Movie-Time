'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { useWatchHistorySync } from '@/lib/hooks/use-recently-watched';

type Tab = 'signin' | 'register';

interface AuthModalProps {
  description?: string;
  initialTab?: Tab;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
}

export function AuthModal({
  description,
  initialTab = 'signin',
  onClose,
  onSuccess,
  title = 'Sign in to PapiFlix',
}: AuthModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [providersResolved, setProvidersResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const papiflixSync = useWatchHistorySync('papiflix', { pollIntervalMs: 60_000 });
  const papianimeSync = useWatchHistorySync('papianime', { pollIntervalMs: 60_000 });

  useEffect(() => {
    const id = setTimeout(() => emailRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let mounted = true;

    void getProviders()
      .then((providers) => {
        if (mounted) {
          setGoogleAvailable(Boolean(providers?.google));
          setProvidersResolved(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setGoogleAvailable(false);
          setProvidersResolved(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const switchTab = useCallback((next: Tab) => {
    setTab(next);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
  }, []);

  const syncClientHistoryToDb = useCallback(async () => {
    try {
      await papiflixSync.pushLocalToServer();
      await papianimeSync.pushLocalToServer();
    } catch {
      // Non-critical sync; ignore failures.
    }
  }, [papianimeSync, papiflixSync]);

  const handleSignIn = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
        const result = await signIn('credentials', {
          email: email.trim().toLowerCase(),
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Invalid email or password.');
        } else {
          await syncClientHistoryToDb();
          onSuccess?.();
          onClose();
        }
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [email, password, syncClientHistoryToDb, onSuccess, onClose],
  );

  const handleGoogleSignIn = useCallback(async () => {
    setError('');
    setGoogleLoading(true);

    try {
      await signIn('google', {
        callbackUrl: window.location.href,
      });
    } catch {
      setGoogleLoading(false);
      setError('Google sign in could not start. Please try again.');
    }
  }, []);

  const handleRegister = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password, name: name.trim() || undefined }),
        });

        const data = (await res.json()) as { error?: string };

        if (!res.ok) {
          setError(data.error ?? 'Registration failed.');
          return;
        }

        const result = await signIn('credentials', {
          email: email.trim().toLowerCase(),
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Account created — please sign in.');
          setTab('signin');
        } else {
          await syncClientHistoryToDb();
          onSuccess?.();
          onClose();
        }
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [name, email, password, syncClientHistoryToDb, onSuccess, onClose],
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-8 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 pr-6">
          <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
          {description ? <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p> : null}
        </div>

        <div className="mb-6 flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          {(['signin', 'register'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === t ? 'bg-netflix-red text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {googleAvailable ? (
          <div className="mb-5">
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={loading || googleLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white px-3 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50"
            >
              <svg
                className="h-5 w-5 text-zinc-950"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  fillRule="evenodd"
                  d="M12.037 21.998a10.313 10.313 0 0 1-7.168-3.049 9.888 9.888 0 0 1-2.868-7.118 9.947 9.947 0 0 1 3.064-6.949A10.37 10.37 0 0 1 12.212 2h.176a9.935 9.935 0 0 1 6.614 2.564L16.457 6.88a6.187 6.187 0 0 0-4.131-1.566 6.9 6.9 0 0 0-4.794 1.913 6.618 6.618 0 0 0-2.045 4.657 6.608 6.608 0 0 0 1.882 4.723 6.891 6.891 0 0 0 4.725 2.07h.143c1.41.072 2.8-.354 3.917-1.2a5.77 5.77 0 0 0 2.172-3.41l.043-.117H12.22v-3.41h9.678c.075.617.109 1.238.1 1.859-.099 5.741-4.017 9.6-9.746 9.6l-.215-.002Z"
                  clipRule="evenodd"
                />
              </svg>
              {googleLoading ? 'Opening Google...' : 'Continue with Google'}
            </button>
            <div className="mt-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        ) : providersResolved ? (
          <p className="mb-5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-zinc-400">
            Google sign-in is unavailable on this deployment. Check the PapiFlix Google OAuth credentials and make sure the redirect URI ends with /api/auth/callback/google.
          </p>
        ) : null}

        <AnimatePresence mode="wait">
          <motion.form
            key={tab}
            initial={{ opacity: 0, x: tab === 'signin' ? -12 : 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            onSubmit={tab === 'signin' ? handleSignIn : handleRegister}
            className="flex flex-col gap-4"
          >
            {tab === 'register' && (
              <div>
                <label htmlFor="name" className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Name (optional)
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-xs font-medium text-zinc-400">
                Email
              </label>
              <input
                ref={emailRef}
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-xs font-medium text-zinc-400">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'register' ? 'Min. 8 characters' : '••••••••'}
                autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                required
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-lg bg-netflix-red py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? (tab === 'signin' ? 'Signing in…' : 'Creating account…') : tab === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </motion.form>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
