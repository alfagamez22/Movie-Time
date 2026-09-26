'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ArrowLeft, LayoutDashboard } from 'lucide-react';

const LINKS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { href: '/dashboard/analytics', icon: Activity, label: 'Analytics' },
];

export function DashboardNav({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-30 border-b border-white/10 bg-[#050505]/95 backdrop-blur md:h-dvh md:w-60 md:shrink-0 md:border-b-0 md:border-r">
      <div className="flex items-center gap-3 px-4 py-3 md:flex-col md:items-stretch md:gap-6 md:px-5 md:py-8">
        <Link href="/" className="text-xl font-black italic tracking-tight">
          Papi<span className="text-red-600">Flix</span>
          <span className="ml-2 align-middle text-[10px] font-semibold not-italic uppercase tracking-[0.25em] text-zinc-500">Admin</span>
        </Link>
        <nav className="ml-auto flex gap-1 md:ml-0 md:flex-col">
          {LINKS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                  active ? 'bg-white text-black' : 'text-zinc-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden space-y-3 md:mt-auto md:block">
          <p className="truncate text-xs text-zinc-500" title={email}>{email}</p>
          <Link href="/" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to PapiFlix
          </Link>
        </div>
      </div>
    </aside>
  );
}
