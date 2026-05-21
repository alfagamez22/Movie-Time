import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { WatchPlayer } from '@/components/media/watch-player';
import { resolveAnimeMediaEntry } from '@/lib/anime/resolve';
import { resolvePlaybackOptions } from '@/lib/media/embed';
import { papianimeExperience } from '@/lib/media/experience';
import { buildWatchHref } from '@/lib/media/routes';
import { normalizeSlug } from '@/lib/slugs/media';
import { isTvEntry, type SeasonDetails } from '@/lib/media/types';

interface AnimeWatchPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function LookupErrorState({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
      <div className="glass flex w-full max-w-xl flex-col gap-5 rounded-2xl p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500">Lookup Failed</p>
        <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
          Unable to resolve this anime
        </h1>
        <p className="text-sm leading-relaxed text-gray-400">{message}</p>
        <Link
          href="/anime"
          className="mx-auto inline-flex rounded-lg bg-netflix-red px-5 py-3 text-sm font-bold uppercase tracking-wider text-white transition-transform active:scale-95"
        >
          Return to anime library
        </Link>
      </div>
    </main>
  );
}

export async function generateMetadata({ params, searchParams }: AnimeWatchPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const identifier = decodeURIComponent(slug);
  const preferredId = Array.isArray(resolvedSearchParams.id) ? resolvedSearchParams.id[0] : resolvedSearchParams.id;
  const resolvedEntry = await resolveAnimeMediaEntry(identifier, preferredId);

  if (!resolvedEntry) {
    return {};
  }

  const playback = resolvePlaybackOptions(resolvedEntry.entry, resolvedSearchParams);
  const title = isTvEntry(resolvedEntry.entry)
    ? `${resolvedEntry.entry.title} Episode ${playback.episode.padStart(2, '0')}`
    : resolvedEntry.entry.title;

  return {
    description: resolvedEntry.entry.synopsis || undefined,
    title,
  };
}

export default async function AnimeWatchPage({ params, searchParams }: AnimeWatchPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const identifier = decodeURIComponent(slug);
  const preferredId = Array.isArray(resolvedSearchParams.id) ? resolvedSearchParams.id[0] : resolvedSearchParams.id;
  const resolvedEntry = await resolveAnimeMediaEntry(identifier, preferredId);

  if (!resolvedEntry) {
    return (
      <LookupErrorState message="Search for a broader anime title or use the Anikoto identifier from the search results." />
    );
  }

  const initialPlayback = resolvePlaybackOptions(resolvedEntry.entry, resolvedSearchParams);
  const canonicalHref = buildWatchHref(resolvedEntry.entry, {
    basePath: papianimeExperience.watchBasePath,
    episode: initialPlayback.episode,
    language: initialPlayback.language,
  });
  const hasCanonicalSlug = normalizeSlug(identifier) === normalizeSlug(resolvedEntry.entry.title);
  const hasCanonicalId = preferredId === resolvedEntry.entry.id;

  if (!hasCanonicalSlug || !hasCanonicalId) {
    redirect(canonicalHref);
  }

  let initialSeasonDetails: SeasonDetails | null = null;

  if (isTvEntry(resolvedEntry.entry)) {
    initialSeasonDetails = resolvedEntry.seasonDetails;
  }

  return (
    <WatchPlayer
      entry={resolvedEntry.entry}
      experience={papianimeExperience}
      initialPlayback={initialPlayback}
      initialSeasonDetails={initialSeasonDetails}
    />
  );
}
