'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

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
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

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
        }
      })
      .catch(() => {
        if (mounted) {
          setGoogleAvailable(false);
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
      const papiflixRaw =
        (sessionStorage.getItem('papiflix-recently-watched-v1') ||
        document.cookie
          .split('; ')
          .find((c) => c.startsWith('papiflix_recently_watched_v1='))
          ?.split('=')
          .slice(1)
          .join('=')) ?? '';

      const papiAnimeRaw =
        (sessionStorage.getItem('papianime-recently-watched-v1') ||
        document.cookie
          .split('; ')
          .find((c) => c.startsWith('papianime_recently_watched_v1='))
          ?.split('=')
          .slice(1)
          .join('=')) ?? '';

      const papiflixEntries = JSON.parse(decodeURIComponent(papiflixRaw) || '[]') as unknown[];
      const papiAnimeEntries = JSON.parse(decodeURIComponent(papiAnimeRaw) || '[]') as unknown[];

      const entries = [
        ...papiflixEntries.map((e) => ({ ...(e as object), experience: 'papiflix' })),
        ...papiAnimeEntries.map((e) => ({ ...(e as object), experience: 'papianime' })),
      ];

      if (entries.length > 0) {
        await fetch('/api/watch-history/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries }),
        });
      }
    } catch {
      // Non-critical sync; ignore failures.
    }
  }, []);

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
              <span className="text-base font-black text-[#1a73e8]">G</span>
              {googleLoading ? 'Opening Google...' : 'Continue with Google'}
            </button>
            <div className="mt-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </div>
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
