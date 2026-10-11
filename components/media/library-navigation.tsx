'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { Home, LayoutGrid, UserRound } from 'lucide-react';
import type { MediaExperienceConfig } from '@/lib/media/experience';

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  window.addEventListener('popstate', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
    window.removeEventListener('popstate', callback);
  };
}

export function LibraryNavigation({ experience }: { experience: MediaExperienceConfig }) {
  const pathname = usePathname();
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  const current = `${pathname}${hash}`;
  const links = [...experience.navLinks, ...(experience.id === 'papiflix' ? [{ href: '/categories', label: 'Categories' }] : []),
    { href: '/my-papiflix', label: 'My PapiFlix' }];

  return <nav aria-label="Main navigation" className="hidden items-center gap-5 text-sm lg:flex xl:gap-7">
    {links.map(({ href, label }) => {
      const active = current === href || (href === '/categories' && pathname.startsWith('/categories/'));
      return <Link key={href} href={href} aria-current={active ? 'page' : undefined}
        onClick={(event) => {
          if (href.split('#')[0] !== pathname || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          if (`${window.location.pathname}${window.location.hash}` !== href) window.history.pushState(null, '', href);
          window.dispatchEvent(new Event('hashchange'));
          const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
          const target = href.split('#')[1];
          if (target) document.getElementById(target)?.scrollIntoView({ behavior, block: 'start' });
          else window.scrollTo({ top: 0, behavior });
        }}
        className={`relative whitespace-nowrap py-2 transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-netflix-red after:transition-transform ${active ? 'font-bold text-white after:scale-x-100' : 'text-zinc-400 hover:text-white after:scale-x-0'}`}>{label}</Link>;
    })}
  </nav>;
}

export function LibraryHeader({ experience }: { experience: MediaExperienceConfig }) {
  return <header className="border-b border-white/5 bg-[#080808]/95">
    <div className="mx-auto flex max-w-[1800px] items-center gap-8 px-5 py-4 md:px-12">
      <Link href={experience.homeHref} aria-label={`${experience.brandName} home`} className="h-10 w-28 shrink-0 bg-no-repeat sm:w-32"
        style={{ backgroundImage: `url('${experience.brandBannerSrc}')`, backgroundPosition: experience.brandBackgroundPosition, backgroundSize: experience.brandBackgroundSize }}>
        <span className="sr-only">{experience.brandName}</span>
      </Link>
      <LibraryNavigation experience={experience} />
      <Link href="/bookmarks" aria-current={undefined} className="ml-auto shrink-0 text-sm text-zinc-300 hover:text-white">My List</Link>
    </div>
  </header>;
}

export function LibraryBottomNavigation({ experience }: { experience: MediaExperienceConfig }) {
  const path = usePathname();
  return <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-white/10 bg-[#111]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
    {[
      { href: experience.homeHref, label: 'Home', Icon: Home, active: path === experience.homeHref },
      { href: '/categories', label: 'Categories', Icon: LayoutGrid, active: path.startsWith('/categories') },
      { href: '/my-papiflix', label: 'My PapiFlix', Icon: UserRound, active: path === '/my-papiflix' || path === '/bookmarks' },
    ].map(({ href, label, Icon, active }) => <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex min-h-16 min-w-20 flex-col items-center justify-center gap-1 text-[11px] ${active ? 'font-bold text-white' : 'text-zinc-500'}`}><Icon className={`h-5 w-5 ${active ? 'text-netflix-red' : ''}`} />{label}</Link>)}
  </nav>;
}
