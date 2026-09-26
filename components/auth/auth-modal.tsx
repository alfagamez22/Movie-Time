'use client';

import { useCallback, useEffect, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';

interface AuthModalProps {
  description?: string;
  onClose: () => void;
  title?: string;
}

export function AuthModal({
  description = 'Sign in with Google to sync your watch history and bookmarks across devices.',
  onClose,
  title = 'Sign in to PapiFlix',
}: AuthModalProps) {
  const [error, setError] = useState('');
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [providersResolved, setProvidersResolved] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let mounted = true;
    void getProviders()
      .then((providers) => {
        if (mounted) setGoogleAvailable(Boolean(providers?.google));
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setProvidersResolved(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await signIn('google', { callbackUrl: window.location.href });
    } catch {
      setGoogleLoading(false);
      setError('Google sign in could not start. Please try again.');
    }
  }, []);

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
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

        <div className="mb-6 pr-6">
          <h2 id="auth-modal-title" className="text-xl font-black tracking-tight text-white">{title}</h2>
          {description ? <p className="mt-2 text-sm leading-relaxed text-zinc-400">{description}</p> : null}
        </div>

        {googleAvailable || !providersResolved ? (
          <button
            type="button"
            autoFocus
            onClick={() => void handleGoogleSignIn()}
            disabled={googleLoading || !providersResolved}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white px-3 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
          >
            <svg className="h-5 w-5 text-zinc-950" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                d="M12.037 21.998a10.313 10.313 0 0 1-7.168-3.049 9.888 9.888 0 0 1-2.868-7.118 9.947 9.947 0 0 1 3.064-6.949A10.37 10.37 0 0 1 12.212 2h.176a9.935 9.935 0 0 1 6.614 2.564L16.457 6.88a6.187 6.187 0 0 0-4.131-1.566 6.9 6.9 0 0 0-4.794 1.913 6.618 6.618 0 0 0-2.045 4.657 6.608 6.608 0 0 0 1.882 4.723 6.891 6.891 0 0 0 4.725 2.07h.143c1.41.072 2.8-.354 3.917-1.2a5.77 5.77 0 0 0 2.172-3.41l.043-.117H12.22v-3.41h9.678c.075.617.109 1.238.1 1.859-.099 5.741-4.017 9.6-9.746 9.6l-.215-.002Z"
                clipRule="evenodd"
              />
            </svg>
            {googleLoading ? 'Opening Google...' : 'Continue with Google'}
          </button>
        ) : (
          <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-zinc-400">
            Google sign-in is unavailable on this deployment. Check the PapiFlix Google OAuth settings and make sure the redirect URI ends with /api/auth/callback/google.
          </p>
        )}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
        ) : null}
      </motion.div>
    </div>
  );
}
