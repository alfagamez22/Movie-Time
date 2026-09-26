import Link from 'next/link';

import { EXPERIENCE_LABELS, formatDuration } from '@/components/dashboard/format';
import { countryFlag } from '@/lib/analytics/request-meta';
import { countUsers, LIVE_WINDOW_MS, querySessions, type WatchSession } from '@/lib/analytics/store';

const DAY_MS = 86_400_000;

function uniqueViewers(sessions: WatchSession[]) {
  return new Set(sessions.map((session) => session.userId ?? session.visitorId)).size;
}

function buildOverview(sessions: WatchSession[], now: number) {
  const within = (ms: number) => sessions.filter((session) => now - Date.parse(session.lastSeenAt) <= ms);
  const day = within(DAY_MS);
  const week = within(7 * DAY_MS);

  const days = Array.from({ length: 14 }, (_, index) => {
    const start = new Date(now - (13 - index) * DAY_MS);
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + DAY_MS;
    const bucket = sessions.filter((session) => {
      const seen = Date.parse(session.lastSeenAt);
      return seen >= start.getTime() && seen < end;
    });
    return { date: start, sessions: bucket.length, viewers: uniqueViewers(bucket) };
  });

  const titles = new Map<string, { experience: string; posterUrl: string | null; seconds: number; title: string; viewers: Set<string> }>();
  const countries = new Map<string, Set<string>>();
  for (const session of week) {
    const viewer = session.userId ?? session.visitorId;
    const key = `${session.experience}:${session.mediaId}`;
    const title = titles.get(key) ?? { experience: session.experience, posterUrl: session.posterUrl, seconds: 0, title: session.title, viewers: new Set() };
    title.seconds += session.watchSeconds;
    title.viewers.add(viewer);
    titles.set(key, title);
    const country = session.country ?? '??';
    countries.set(country, (countries.get(country) ?? new Set()).add(viewer));
  }

  const topByExperience = Object.keys(EXPERIENCE_LABELS).map((experience) => ({
    experience,
    items: [...titles.values()]
      .filter((title) => title.experience === experience)
      .sort((a, b) => b.viewers.size - a.viewers.size || b.seconds - a.seconds)
      .slice(0, 5),
  }));

  return {
    anonymous7d: new Set(week.filter((s) => !s.userId).map((s) => s.visitorId)).size,
    countries: [...countries.entries()].map(([code, viewers]) => ({ code, viewers: viewers.size })).sort((a, b) => b.viewers - a.viewers).slice(0, 10),
    days,
    live: uniqueViewers(within(LIVE_WINDOW_MS)),
    signedIn7d: new Set(week.filter((s) => s.userId).map((s) => s.userId)).size,
    topByExperience,
    viewers24h: uniqueViewers(day),
    viewers7d: uniqueViewers(week),
    watchSeconds7d: week.reduce((total, session) => total + session.watchSeconds, 0),
  };
}

function StatCard({ hint, label, value, accent }: { accent?: boolean; hint?: string; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className={`mt-2 flex items-center gap-2 text-3xl font-black tracking-tight md:text-4xl ${accent ? 'text-red-500' : 'text-white'}`}>
        {accent ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> : null}
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function ActivityChart({ days }: { days: ReturnType<typeof buildOverview>['days'] }) {
  const max = Math.max(1, ...days.map((day) => day.viewers));
  const width = 700;
  const height = 180;
  const barWidth = width / days.length;

  return (
    <svg viewBox={`0 0 ${width} ${height + 24}`} className="h-auto w-full" role="img" aria-label="Unique viewers per day, last 14 days">
      {days.map((day, index) => {
        const barHeight = Math.max(2, (day.viewers / max) * height);
        const x = index * barWidth + barWidth * 0.18;
        return (
          <g key={day.date.toISOString()}>
            <title>{`${day.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}: ${day.viewers} viewers, ${day.sessions} sessions`}</title>
            <rect x={x} y={height - barHeight} width={barWidth * 0.64} height={barHeight} rx={3} className={index === days.length - 1 ? 'fill-red-600' : 'fill-zinc-600'} />
            {index % 2 === days.length % 2 ? (
              <text x={x + barWidth * 0.32} y={height + 18} textAnchor="middle" className="fill-zinc-500 text-[11px]">
                {day.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

async function loadOverview() {
  const now = Date.now();
  const [sessions, users] = await Promise.all([
    querySessions({ limit: 5000, since: new Date(now - 14 * DAY_MS) }),
    countUsers(),
  ]);
  return { overview: buildOverview(sessions, now), users };
}

export default async function DashboardOverviewPage() {
  const { overview, users } = await loadOverview();
  const maxCountry = Math.max(1, ...overview.countries.map((country) => country.viewers));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Overview</h1>
          <p className="mt-1 text-sm text-zinc-400">Last 14 days across PapiFlix, PapiAnime and PapiManga. Admin sessions excluded.</p>
        </div>
        <Link href="/dashboard/analytics" className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-bold text-black hover:bg-zinc-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> {overview.live} watching now
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
        <StatCard label="Live now" value={overview.live} accent />
        <StatCard label="Viewers 24h" value={overview.viewers24h} />
        <StatCard label="Viewers 7d" value={overview.viewers7d} hint={`${overview.signedIn7d} signed in · ${overview.anonymous7d} anonymous`} />
        <StatCard label="Watch time 7d" value={formatDuration(overview.watchSeconds7d)} />
        <StatCard label="Accounts" value={users} hint="Registered users" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 md:p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold">Daily viewers</h2>
          <ActivityChart days={overview.days} />
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
          <h2 className="mb-4 text-lg font-bold">Top countries · 7d</h2>
          {overview.countries.length === 0 ? <p className="text-sm text-zinc-500">No viewers yet.</p> : (
            <ul className="space-y-3">
              {overview.countries.map((country) => (
                <li key={country.code} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span><span className="mr-2 text-lg" aria-hidden="true">{countryFlag(country.code)}</span>{country.code}</span>
                    <span className="tabular-nums text-zinc-400">{country.viewers}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-red-600" style={{ width: `${(country.viewers / maxCountry) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {overview.topByExperience.map(({ experience, items }) => (
          <div key={experience} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
            <h2 className="mb-4 text-lg font-bold">Top on {EXPERIENCE_LABELS[experience]} · 7d</h2>
            {items.length === 0 ? <p className="text-sm text-zinc-500">Nothing watched yet.</p> : (
              <ol className="space-y-3">
                {items.map((item, index) => (
                  <li key={item.title} className="flex items-center gap-3">
                    <span className="w-4 text-sm font-black text-zinc-600">{index + 1}</span>
                    {item.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.posterUrl} alt="" className="h-12 w-8 shrink-0 rounded object-cover" loading="lazy" />
                    ) : <div className="h-12 w-8 shrink-0 rounded bg-zinc-800" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" title={item.title}>{item.title}</p>
                      <p className="text-xs text-zinc-500">{item.viewers.size} viewers · {formatDuration(item.seconds)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
