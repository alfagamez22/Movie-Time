'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

import { countryFlag } from '@/lib/analytics/request-meta';
import type { WatchSession } from '@/lib/analytics/store';

import { EXPERIENCE_LABELS, episodeLabel, formatDuration, formatRelative } from './format';

type Tab = 'live' | 'history';
interface Filters { country: string; experience: string; search: string; signedIn: string }
interface UserDetail {
  bookmarks: Array<{ id: string; title?: string; posterUrl?: string; experience?: string; createdAt?: string }>;
  history: Array<{ id: string; title?: string; posterUrl?: string; experience?: string; season?: string; episode?: string; watchedAt?: string }>;
  sessions: WatchSession[];
}

const POLL_MS = 5000;

function Poster({ src }: { src: string | null | undefined }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-14 w-10 shrink-0 rounded object-cover ring-1 ring-white/10" loading="lazy" />
  ) : <div className="h-14 w-10 shrink-0 rounded bg-zinc-800" />;
}

function Country({ code, city }: { city?: string | null; code: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={city ? `${city}, ${code ?? 'Unknown'}` : code ?? 'Unknown'}>
      <span className="text-lg leading-none" aria-hidden="true">{countryFlag(code)}</span>
      <span className="font-mono text-xs font-semibold">{code ?? '??'}</span>
    </span>
  );
}

function Viewer({ onOpen, session }: { onOpen: (session: WatchSession) => void; session: WatchSession }) {
  if (!session.userId) {
    return (
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-300">Anonymous</p>
        <p className="truncate font-mono text-[11px] text-zinc-500" title={session.visitorId}>{session.visitorId.slice(0, 8)}</p>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(session)} className="min-w-0 text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      <p className="truncate text-sm font-semibold text-white" title={session.email ?? ''}>{session.email ?? session.name ?? 'Signed in'}</p>
      {session.name ? <p className="truncate text-[11px] text-zinc-500">{session.name}</p> : null}
    </button>
  );
}

function NowWatching({ session }: { session: WatchSession }) {
  const label = episodeLabel(session.season, session.episode);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Poster src={session.posterUrl} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" title={session.title}>{session.title}</p>
        <p className="text-xs text-zinc-500">{[EXPERIENCE_LABELS[session.experience] ?? session.experience, label].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
  );
}

function isLive(session: WatchSession, now: number) {
  return now - Date.parse(session.lastSeenAt) <= 60_000;
}

function SessionTable({ now, onOpen, sessions }: { now: number; onOpen: (session: WatchSession) => void; sessions: WatchSession[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-white/10 lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.15em] text-zinc-500">
            <tr>
              {['Viewer', 'IP', 'Country', 'Device', 'Watching', 'Watched', 'Started', 'Last seen'].map((heading) => (
                <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sessions.map((session) => (
              <tr key={session.id} className="hover:bg-white/[0.03]">
                <td className="max-w-[220px] px-4 py-3"><Viewer session={session} onOpen={onOpen} /></td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-300">{session.ip ?? '—'}</td>
                <td className="px-4 py-3"><Country code={session.country} city={session.city} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">{session.device}</td>
                <td className="max-w-[320px] px-4 py-3"><NowWatching session={session} /></td>
                <td className="px-4 py-3 tabular-nums text-zinc-300">{formatDuration(session.watchSeconds)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">{formatRelative(session.startedAt, now)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">
                  {isLive(session, now)
                    ? <span className="inline-flex items-center gap-1.5 font-semibold text-red-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />Live</span>
                    : <span className="text-zinc-400">{formatRelative(session.lastSeenAt, now)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {sessions.map((session) => (
          <li key={session.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <Viewer session={session} onOpen={onOpen} />
              <Country code={session.country} city={session.city} />
            </div>
            <div className="mt-3"><NowWatching session={session} /></div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
              <span className="font-mono">{session.ip ?? '—'}</span>
              <span>{session.device}</span>
              <span>{formatDuration(session.watchSeconds)} watched</span>
              {isLive(session, now)
                ? <span className="font-semibold text-red-500">● Live</span>
                : <span>{formatRelative(session.lastSeenAt, now)}</span>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function UserDrawer({ onClose, session }: { onClose: () => void; session: WatchSession }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/users/${encodeURIComponent(session.userId!)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(setDetail)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Failed to load');
      });
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      controller.abort();
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, session.userId]);

  const ips = [...new Set(detail?.sessions.map((item) => item.ip).filter(Boolean))];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={`Activity for ${session.email ?? 'user'}`}
        className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0b0b0b] p-5 md:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{session.email}</p>
            {session.name ? <p className="text-sm text-zinc-400">{session.name}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        {error ? <p className="mt-6 text-sm text-red-400">{error}</p> : !detail ? <p className="mt-6 text-sm text-zinc-500">Loading…</p> : (
          <div className="mt-6 space-y-6 text-sm">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Known IPs</h3>
              <p className="font-mono text-xs text-zinc-300">{ips.length ? ips.join(', ') : '—'}</p>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Watch history ({detail.history.length})</h3>
              <ul className="space-y-2">
                {detail.history.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <Poster src={item.posterUrl} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{item.title ?? 'Untitled'}</p>
                      <p className="text-xs text-zinc-500">
                        {[EXPERIENCE_LABELS[item.experience ?? ''], episodeLabel(item.season ?? null, item.episode ?? null), item.watchedAt ? formatRelative(item.watchedAt) : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </li>
                ))}
                {detail.history.length === 0 ? <li className="text-zinc-500">No history.</li> : null}
              </ul>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Bookmarks ({detail.bookmarks.length})</h3>
              <ul className="grid grid-cols-4 gap-2">
                {detail.bookmarks.map((item) => (
                  <li key={item.id} title={item.title}><Poster src={item.posterUrl} /></li>
                ))}
              </ul>
              {detail.bookmarks.length === 0 ? <p className="text-zinc-500">No bookmarks.</p> : null}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

export function LiveAnalytics() {
  const [tab, setTab] = useState<Tab>('live');
  const [filters, setFilters] = useState<Filters>({ country: '', experience: '', search: '', signedIn: '' });
  const [includeAdmin, setIncludeAdmin] = useState(false);
  const [sessions, setSessions] = useState<WatchSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<WatchSession | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams();
    if (includeAdmin) params.set('includeAdmin', '1');
    if (tab === 'history') {
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    }
    try {
      const response = await fetch(`/api/admin/analytics/${tab}?${params}`, { cache: 'no-store', signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json() as { sessions: WatchSession[] };
      setSessions(json.sessions);
      setError(null);
      setNow(Date.now());
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Failed to load');
    }
  }, [filters, includeAdmin, tab]);

  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void load(controller.signal), tab === 'history' ? 300 : 0);
    const timer = tab === 'live'
      ? setInterval(() => document.visibilityState === 'visible' && void load(controller.signal), POLL_MS)
      : undefined;
    return () => {
      controller.abort();
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load, tab]);

  const closeDrawer = useCallback(() => setSelected(null), []);
  const liveViewers = sessions ? new Set(sessions.map((session) => session.userId ?? session.visitorId)).size : 0;
  const inputClass = 'rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Analytics</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {tab === 'live' ? `${liveViewers} viewer${liveViewers === 1 ? '' : 's'} active in the last 60s · refreshes every 5s` : 'Most recent 300 sessions (90-day retention)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={includeAdmin} onChange={(event) => setIncludeAdmin(event.target.checked)} className="accent-red-600" />
            Include admin
          </label>
          <button type="button" onClick={() => void load()} aria-label="Refresh" className="rounded-md bg-white/10 p-2 hover:bg-white/20">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div role="tablist" className="inline-flex rounded-lg bg-white/5 p-1">
        {(['live', 'history'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => { setSessions(null); setTab(value); }}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${tab === value ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            {value === 'live' ? '● Live' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input className={inputClass} placeholder="Search email, title or IP" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          <select className={inputClass} value={filters.signedIn} onChange={(event) => setFilters({ ...filters, signedIn: event.target.value })}>
            <option value="">All viewers</option>
            <option value="yes">Signed in</option>
            <option value="no">Anonymous</option>
          </select>
          <select className={inputClass} value={filters.experience} onChange={(event) => setFilters({ ...filters, experience: event.target.value })}>
            <option value="">All sites</option>
            {Object.entries(EXPERIENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className={inputClass} placeholder="Country code (e.g. PH)" maxLength={2} value={filters.country} onChange={(event) => setFilters({ ...filters, country: event.target.value.toUpperCase() })} />
        </div>
      ) : null}

      {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Couldn&apos;t load analytics: {error}</p> : null}

      {sessions === null ? (
        <div className="space-y-3">{[0, 1, 2].map((index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-white/5" />)}</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500">
          {tab === 'live' ? 'Nobody is watching right now.' : 'No sessions match these filters.'}
        </div>
      ) : (
        <SessionTable now={now} sessions={sessions} onOpen={setSelected} />
      )}

      {selected?.userId ? <UserDrawer session={selected} onClose={closeDrawer} /> : null}
    </div>
  );
}
