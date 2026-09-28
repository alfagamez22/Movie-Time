import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { WatchPlayer } from '@/components/media/watch-player';
import { auth } from '@/lib/auth';
import { resolvePlaybackOptions } from '@/lib/media/embed';
import { papiflixExperience } from '@/lib/media/experience';
import { toPapiflixSeasonDetails, toTmdbSeasonNumber } from '@/lib/media/season-layout';
import { resolveLiveMediaEntry } from '@/lib/media/resolve';
import { buildWatchHref, parseMediaType } from '@/lib/media/routes';
import { getResumePoint } from '@/lib/media/watch-history';
import { canonicalWatchPath, jsonLdScript, titleJsonLd } from '@/lib/seo';
import { normalizeSlug } from '@/lib/slugs/media';
import { lookupTmdbMediaEntry, lookupTmdbSeasonDetails } from '@/lib/tmdb/client';
import { isTvEntry, type SeasonDetails } from '@/lib/media/types';

interface WatchPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function AnimeOnPapiAnimeState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
      <div className="glass flex w-full max-w-xl flex-col gap-5 rounded-2xl p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gray-400">Anime</p>
        <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">Watch this on PapiAnime</h1>
        <p className="text-sm leading-relaxed text-gray-300">
          Anime has its own home with subs, dubs and episode tracking. Search for this title on PapiAnime.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/anime"
            className="inline-flex rounded-lg bg-netflix-red px-5 py-3 text-sm font-bold uppercase tracking-wider text-white transition-transform active:scale-95"
          >
            Open PapiAnime
          </Link>
          <Link href="/" className="inline-flex rounded-lg bg-white/10 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white">
            Back to PapiFlix
          </Link>
        </div>
      </div>
    </main>
  );
}

function LookupErrorState({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
      <div className="glass flex w-full max-w-xl flex-col gap-5 rounded-2xl p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500">Lookup Failed</p>
        <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
          Unable to resolve this title
        </h1>
        <p className="text-sm leading-relaxed text-gray-400">{message}</p>
        <Link
          href="/"
          className="mx-auto inline-flex rounded-lg bg-netflix-red px-5 py-3 text-sm font-bold uppercase tracking-wider text-white transition-transform active:scale-95"
        >
          Return to library
        </Link>
      </div>
    </main>
  );
}

export async function generateMetadata({ params, searchParams }: WatchPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const identifier = decodeURIComponent(slug);
  const rawType = Array.isArray(resolvedSearchParams.type) ? resolvedSearchParams.type[0] : resolvedSearchParams.type;
  const preferredTmdbId = Array.isArray(resolvedSearchParams.id) ? resolvedSearchParams.id[0] : resolvedSearchParams.id;
  const requestedType = parseMediaType(rawType);
  if (preferredTmdbId && requestedType) {
    const direct = await lookupTmdbMediaEntry(preferredTmdbId, requestedType);
    if (!direct.ok && direct.reason === 'anime-excluded') return { title: 'Watch on PapiAnime' };
  }
  const resolvedEntry = await resolveLiveMediaEntry(identifier, parseMediaType(rawType), preferredTmdbId);

  if (!resolvedEntry) {
    return {};
  }

  const playback = resolvePlaybackOptions(resolvedEntry.entry, resolvedSearchParams);
  const title = isTvEntry(resolvedEntry.entry)
    ? `${resolvedEntry.entry.title} S${playback.season.padStart(2, '0')}E${playback.episode.padStart(2, '0')}`
    : resolvedEntry.entry.title;

  const entry = resolvedEntry.entry;
  const canonical = canonicalWatchPath(normalizeSlug(entry.title) || entry.id, entry.type, entry.id);
  const heading = isTvEntry(entry) ? `Watch ${entry.title} Online` : `Watch ${entry.title}${entry.year ? ` (${entry.year})` : ''} Online`;
  const image = entry.backdropUrl ?? entry.posterUrl;

  return {
    alternates: { canonical },
    description: entry.synopsis?.slice(0, 160) || `Stream ${entry.title} on PapiFlix.`,
    openGraph: {
      description: entry.synopsis?.slice(0, 200) || undefined,
      images: image ? [{ url: image }] : undefined,
      title: heading,
      type: isTvEntry(entry) ? 'video.tv_show' : 'video.movie',
      url: canonical,
    },
    title,
    twitter: { card: 'summary_large_image', images: image ? [image] : undefined, title: heading },
  };
}

export default async function WatchPage({ params, searchParams }: WatchPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const identifier = decodeURIComponent(slug);
  const rawType = Array.isArray(resolvedSearchParams.type) ? resolvedSearchParams.type[0] : resolvedSearchParams.type;
  const preferredTmdbId = Array.isArray(resolvedSearchParams.id) ? resolvedSearchParams.id[0] : resolvedSearchParams.id;
  // Check the requested ID first: otherwise a blocked anime ID falls back to a name search and plays a lookalike.
  const requestedType = parseMediaType(rawType);
  if (preferredTmdbId && requestedType) {
    const direct = await lookupTmdbMediaEntry(preferredTmdbId, requestedType);
    if (!direct.ok && direct.reason === 'anime-excluded') return <AnimeOnPapiAnimeState />;
  }
  const resolvedEntry = await resolveLiveMediaEntry(identifier, parseMediaType(rawType), preferredTmdbId);

  if (!resolvedEntry) {
    return (
      <LookupErrorState message="Search for a broader title or use the numeric identifier from the search results." />
    );
  }

  let initialPlayback = resolvePlaybackOptions(resolvedEntry.entry, resolvedSearchParams);
  if (initialPlayback.progress === null) {
    const session = await auth();
    if (session?.user?.id) {
      const isSeries = isTvEntry(resolvedEntry.entry);
      const hasExplicitEpisode = Boolean(resolvedSearchParams.s || resolvedSearchParams.e);
      const resume = await getResumePoint(
        session.user.id,
        resolvedEntry.entry,
        isSeries && hasExplicitEpisode ? { episode: initialPlayback.episode, season: initialPlayback.season } : undefined,
      ).catch(() => null);
      if (resume) {
        initialPlayback = {
          ...initialPlayback,
          ...(isSeries && !hasExplicitEpisode && resume.season && resume.episode
            ? { episode: resume.episode, season: resume.season }
            : {}),
          progress: resume.progressSeconds,
        };
      }
    }
  }
  const canonicalHref = buildWatchHref(resolvedEntry.entry, {
    autoPlay: initialPlayback.autoPlay,
    basePath: papiflixExperience.watchBasePath,
    color: initialPlayback.color,
    episode: initialPlayback.episode,
    progress: initialPlayback.progress,
    season: initialPlayback.season,
  });
  const hasCanonicalSlug = normalizeSlug(identifier) === normalizeSlug(resolvedEntry.entry.title);
  const hasCanonicalId = preferredTmdbId === resolvedEntry.entry.id;
  const hasCanonicalType = rawType === resolvedEntry.entry.type;

  if (!hasCanonicalSlug || !hasCanonicalId || !hasCanonicalType) {
    redirect(canonicalHref);
  }

  let initialSeasonDetails: SeasonDetails | null = null;

  if (isTvEntry(resolvedEntry.entry)) {
    const seasonDetailsLookup = await lookupTmdbSeasonDetails(
      resolvedEntry.entry.id,
      toTmdbSeasonNumber(resolvedEntry.entry, Number.parseInt(initialPlayback.season, 10)),
    );
    if (seasonDetailsLookup.ok) {
      initialSeasonDetails = toPapiflixSeasonDetails(
        resolvedEntry.entry,
        Number.parseInt(initialPlayback.season, 10),
        seasonDetailsLookup.data,
      );
    }
  }

  /* The retired P7 player required this extra IMDb lookup.
  const imdbId = resolvedEntry.entry.provider === 'tmdb'
    ? await resolveStreamimdbId(resolvedEntry.entry.id, resolvedEntry.entry.type)
    : null;
  */

  const canonical = canonicalWatchPath(normalizeSlug(resolvedEntry.entry.title) || resolvedEntry.entry.id, resolvedEntry.entry.type, resolvedEntry.entry.id);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(titleJsonLd(resolvedEntry.entry, canonical))} />
      <WatchPlayer
        entry={resolvedEntry.entry}
        experience={papiflixExperience}
        initialPlayback={initialPlayback}
        initialSeasonDetails={initialSeasonDetails}
      />
    </>
  );
}
