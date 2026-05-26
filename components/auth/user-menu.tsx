'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { AnimatePresence, motion } from 'motion/react';
import { LogOut, User } from 'lucide-react';
import Image from 'next/image';

interface UserMenuProps {
  onSignInClick: () => void;
}

export function UserMenu({ onSignInClick }: UserMenuProps) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const handleSignOut = useCallback(async () => {
    setOpen(false);
    await signOut({ redirect: false });
  }, []);

  if (status === 'loading') {
    return <div className="h-8 w-16 animate-pulse rounded-full bg-white/10" />;
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={onSignInClick}
        className="flex items-center gap-1.5 rounded-full bg-netflix-red px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:brightness-110 active:scale-95"
      >
        <User className="h-3.5 w-3.5 shrink-0" />
        Sign In
      </button>
    );
  }

  const initials = session.user.name
    ? session.user.name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : session.user.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-netflix-red text-xs font-bold text-white ring-2 ring-transparent transition-all hover:ring-white/30 active:scale-95"
      >
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt={session.user.name ?? 'User avatar'}
            fill
            sizes="32px"
            className="object-cover"
          />
        ) : (
          initials
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-10 z-[60] min-w-[12rem] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-netflix-red">
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name ?? 'User avatar'}
                    fill
                    sizes="32px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                    {initials}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                {session.user.name && (
                  <p className="truncate text-sm font-semibold text-white">{session.user.name}</p>
                )}
                <p className="truncate text-xs text-zinc-500">{session.user.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign Out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
