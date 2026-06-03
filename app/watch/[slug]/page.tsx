import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { WatchPlayer } from '@/components/media/watch-player';
import { resolvePlaybackOptions } from '@/lib/media/embed';
import { papiflixExperience } from '@/lib/media/experience';
import { resolveLiveMediaEntry } from '@/lib/media/resolve';
import { buildWatchHref, parseMediaType } from '@/lib/media/routes';
import { resolveStreamimdbId } from '@/lib/media/streamimdb-resolver';
import { normalizeSlug } from '@/lib/slugs/media';
import { lookupTmdbSeasonDetails } from '@/lib/tmdb/client';
import { isTvEntry, type SeasonDetails } from '@/lib/media/types';

interface WatchPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const resolvedEntry = await resolveLiveMediaEntry(identifier, parseMediaType(rawType), preferredTmdbId);

  if (!resolvedEntry) {
    return {};
  }

  const playback = resolvePlaybackOptions(resolvedEntry.entry, resolvedSearchParams);
  const title = isTvEntry(resolvedEntry.entry)
    ? `${resolvedEntry.entry.title} S${playback.season.padStart(2, '0')}E${playback.episode.padStart(2, '0')}`
    : resolvedEntry.entry.title;

  return {
    description: resolvedEntry.entry.synopsis || undefined,
    title,
  };
}

export default async function WatchPage({ params, searchParams }: WatchPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const identifier = decodeURIComponent(slug);
  const rawType = Array.isArray(resolvedSearchParams.type) ? resolvedSearchParams.type[0] : resolvedSearchParams.type;
  const preferredTmdbId = Array.isArray(resolvedSearchParams.id) ? resolvedSearchParams.id[0] : resolvedSearchParams.id;
  const resolvedEntry = await resolveLiveMediaEntry(identifier, parseMediaType(rawType), preferredTmdbId);

  if (!resolvedEntry) {
    return (
      <LookupErrorState message="Search for a broader title or use the numeric identifier from the search results." />
    );
  }

  const initialPlayback = resolvePlaybackOptions(resolvedEntry.entry, resolvedSearchParams);
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
      Number.parseInt(initialPlayback.season, 10),
    );
    if (seasonDetailsLookup.ok) {
      initialSeasonDetails = seasonDetailsLookup.data;
    }
  }

  const imdbId = resolvedEntry.entry.provider === 'tmdb'
    ? await resolveStreamimdbId(resolvedEntry.entry.id, resolvedEntry.entry.type)
    : null;

  return (
    <WatchPlayer
      entry={resolvedEntry.entry}
      experience={papiflixExperience}
      imdbId={imdbId}
      initialPlayback={initialPlayback}
      initialSeasonDetails={initialSeasonDetails}
    />
  );
}
