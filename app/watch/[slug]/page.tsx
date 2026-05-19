import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { WatchPlayer } from '@/components/media/watch-player';
import { resolveMediaIdentifier } from '@/lib/media/catalog';
import { resolvePlaybackOptions } from '@/lib/media/embed';
import { normalizeSlug } from '@/lib/slugs/media';
import { lookupTmdbMediaEntry, lookupTmdbSeasonDetails, mergeCatalogEntryWithTmdb } from '@/lib/tmdb/client';
import { isTvEntry, type MediaEntry, type MediaType, type SeasonDetails } from '@/lib/media/types';

interface WatchPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildWatchQuery(
  entryType: MediaType,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const nextSearchParams = new URLSearchParams();

  const color = Array.isArray(searchParams.color) ? searchParams.color[0] : searchParams.color;
  const autoPlay = Array.isArray(searchParams.autoPlay) ? searchParams.autoPlay[0] : searchParams.autoPlay;
  const progress = Array.isArray(searchParams.progress) ? searchParams.progress[0] : searchParams.progress;

  const season = Array.isArray(searchParams.s) ? searchParams.s[0] : searchParams.s;
  const episode = Array.isArray(searchParams.e) ? searchParams.e[0] : searchParams.e;

  if (color) {
    nextSearchParams.set('color', color);
  }

  if (autoPlay) {
    nextSearchParams.set('autoPlay', autoPlay);
  }

  if (progress) {
    nextSearchParams.set('progress', progress);
  }

  if (entryType === 'tv') {
    if (season) {
      nextSearchParams.set('s', season);
    }
    if (episode) {
      nextSearchParams.set('e', episode);
    }
  }

  const queryString = nextSearchParams.toString();
  return queryString ? `?${queryString}` : '';
}

function ManualLookupError({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
      <div className="glass flex w-full max-w-xl flex-col gap-5 rounded-2xl p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gray-500">TMDB lookup</p>
        <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
          Unable to resolve this TMDB ID
        </h1>
        <p className="text-sm leading-relaxed text-gray-400">{message}</p>
        <Link
          href="/"
          className="mx-auto inline-flex rounded-lg bg-netflix-red px-5 py-3 text-sm font-bold uppercase tracking-wider text-white transition-transform active:scale-95"
        >
          Return to catalog
        </Link>
      </div>
    </main>
  );
}

export default async function WatchPage({ params, searchParams }: WatchPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const identifier = decodeURIComponent(slug);
  const resolution = resolveMediaIdentifier(identifier);

  if (resolution) {
    const normalizedIdentifier = normalizeSlug(identifier);
    if (normalizedIdentifier !== resolution.entry.slug) {
      redirect(`/watch/${resolution.entry.slug}${buildWatchQuery(resolution.entry.type, resolvedSearchParams)}`);
    }

    let entry: MediaEntry = resolution.entry;

    if (isTvEntry(resolution.entry)) {
      const tmdbLookup = await lookupTmdbMediaEntry(resolution.entry.tmdbId, resolution.entry.type);
      if (tmdbLookup.ok) {
        entry = mergeCatalogEntryWithTmdb(resolution.entry, tmdbLookup.entry);
      }
    }

    const initialPlayback = resolvePlaybackOptions(entry, resolvedSearchParams);
    let initialSeasonDetails: SeasonDetails | null = null;

    if (isTvEntry(entry)) {
      const seasonDetailsLookup = await lookupTmdbSeasonDetails(entry.tmdbId, Number.parseInt(initialPlayback.season, 10));
      if (seasonDetailsLookup.ok) {
        initialSeasonDetails = seasonDetailsLookup.data;
      }
    }

    return (
      <WatchPlayer
        entry={entry}
        initialPlayback={initialPlayback}
        initialSeasonDetails={initialSeasonDetails}
        isCatalogEntry
      />
    );
  }

  if (/^\d+$/.test(identifier)) {
    const rawType = Array.isArray(resolvedSearchParams.type)
      ? resolvedSearchParams.type[0]
      : resolvedSearchParams.type;
    const mediaType: MediaType = rawType === 'tv' ? 'tv' : 'movie';
    const tmdbLookup = await lookupTmdbMediaEntry(identifier, mediaType);

    if (!tmdbLookup.ok) {
      return <ManualLookupError message={tmdbLookup.message} />;
    }

    const initialPlayback = resolvePlaybackOptions(tmdbLookup.entry, resolvedSearchParams);
    let initialSeasonDetails: SeasonDetails | null = null;

    if (isTvEntry(tmdbLookup.entry)) {
      const seasonDetailsLookup = await lookupTmdbSeasonDetails(
        tmdbLookup.entry.tmdbId,
        Number.parseInt(initialPlayback.season, 10),
      );
      if (seasonDetailsLookup.ok) {
        initialSeasonDetails = seasonDetailsLookup.data;
      }
    }

    return (
      <WatchPlayer
        entry={tmdbLookup.entry}
        initialPlayback={initialPlayback}
        initialSeasonDetails={initialSeasonDetails}
        isCatalogEntry={false}
      />
    );
  }

  notFound();
}