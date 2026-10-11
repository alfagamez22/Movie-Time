'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

import { LoadingTransition } from '@/components/ui/loading-transition';

export function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pending = status === 'loading';
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return (
    <>
      <div inert={pending} aria-hidden={pending || undefined} style={pending ? { visibility: 'hidden' } : undefined} className={pending ? undefined : 'loading-reveal'}>
        {children}
      </div>
      <LoadingTransition active={pending} label="Loading your session" />
      {pending && slow ? (
        <div className="fixed inset-x-0 top-2/3 z-[201] px-6 text-center text-sm text-zinc-400" role="alert">
          <p>This is taking longer than usual. Check your connection and try again.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-full bg-netflix-red px-5 py-2 font-semibold text-white">Retry</button>
        </div>
      ) : null}
    </>
  );
}
