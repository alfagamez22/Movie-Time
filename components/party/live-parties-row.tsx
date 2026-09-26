'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

import type { PublicParty } from '@/lib/party/types';

const POLL_MS = 30_000;

function formatClock(totalSeconds: number) {
  const value = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = String(value % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

function joinHref(party: PublicParty) {
  const url = new URL(party.watchPath, 'https://papiflix.local');
  url.searchParams.set('party', party.code);
  return `${url.pathname}${url.search}`;
}

function PartyCard({ party }: { party: PublicParty }) {
  const image = party.backdropUrl ?? party.posterUrl;
  const percent = party.duration ? Math.min(100, (party.time / party.duration) * 100) : 0;
  const episode = party.episode ? `${party.season ? `S${party.season} · ` : ''}E${party.episode}` : null;

  return (
    <Link
      href={joinHref(party)}
      aria-label={`Join ${party.hostName}'s watch party for ${party.title}`}
      className="cinema-card group relative block shrink-0 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-red-600/30 transition duration-200 hover:-translate-y-1 hover:ring-2 hover:ring-red-500 focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <div className="relative aspect-video">
        {image ? (
          <Image src={image} alt="" fill sizes="(max-width: 767px) 76vw, 27vw" className="object-cover transition duration-300 group-hover:scale-105" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/30" />

        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-[0_0_18px_rgba(220,38,38,0.6)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          Live
        </span>
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white backdrop-blur">
          <Users className="h-3.5 w-3.5" />
          {party.viewerCount}
        </span>

        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="line-clamp-1 text-base font-black text-white drop-shadow sm:text-lg">{party.title}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-300">
            <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-zinc-700 ring-1 ring-red-500">
              {party.hostImage ? <Image src={party.hostImage} alt="" fill sizes="20px" className="object-cover" /> : null}
            </span>
            <span className="truncate">Hosted by {party.hostName}</span>
            {episode ? <span className="shrink-0 text-zinc-400">· {episode}</span> : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="h-1 flex-1 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-red-600" style={{ width: `${percent}%` }} />
        </div>
        <span className="shrink-0 font-mono text-[11px] text-zinc-400">
          {formatClock(party.time)}{party.duration ? ` / ${formatClock(party.duration)}` : ''}
        </span>
        <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-bold text-black transition group-hover:bg-red-600 group-hover:text-white">
          Join
        </span>
      </div>
    </Link>
  );
}

export function LivePartiesRow({ experience }: { experience: 'papiflix' | 'papianime' }) {
  const [parties, setParties] = useState<PublicParty[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      void fetch(`/api/party?experience=${experience}`)
        .then((response) => (response.ok ? response.json() : { parties: [] }))
        .then((json: { parties?: PublicParty[] }) => {
          if (!cancelled) setParties(json.parties ?? []);
        })
        .catch(() => undefined);
    };
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [experience]);

  const scrollBy = useCallback((direction: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollBy({ behavior: 'smooth', left: direction * scroller.clientWidth * 0.8 });
  }, []);

  if (parties.length === 0) return null;

  return (
    <section id="live-watch-parties" aria-label="Live watch parties" className="content-auto-section group/row relative">
      <div className="mx-auto mb-3 flex max-w-[1800px] items-center gap-3 px-6 md:px-12">
        <h2 className="text-lg font-bold md:text-2xl">Live Watch Parties</h2>
        <span className="flex items-center gap-1.5 rounded-full bg-red-600/15 px-2.5 py-0.5 text-xs font-bold text-red-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          {parties.length} live
        </span>
      </div>
      <div className="relative">
        <div ref={scrollerRef} className="flex gap-4 overflow-x-auto scroll-smooth px-6 pb-2 [scrollbar-width:none] md:px-12">
          {parties.map((party) => <PartyCard key={party.code} party={party} />)}
        </div>
        {parties.length > 2 ? (
          <>
            <button type="button" aria-label="Scroll left" onClick={() => scrollBy(-1)} className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/60 p-2 text-white opacity-0 backdrop-blur transition group-hover/row:opacity-100 md:block">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" aria-label="Scroll right" onClick={() => scrollBy(1)} className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/60 p-2 text-white opacity-0 backdrop-blur transition group-hover/row:opacity-100 md:block">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
