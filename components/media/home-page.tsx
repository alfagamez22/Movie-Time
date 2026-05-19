'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Film, Link2, Play, Tv } from 'lucide-react';
import { motion } from 'motion/react';

import { normalizeSlug } from '@/lib/slugs/media';
import { getEpisodeLimit, isTvEntry, type MediaEntry, type MediaType } from '@/lib/media/types';

interface HomePageProps {
  catalog: Record<MediaType, MediaEntry[]>;
}

interface MetadataLookupState {
  entry: MediaEntry | null;
  error: string | null;
  key: string;
}

function clampPositiveInteger(value: string, max: number): string {
  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue) || parsedValue < 1) {
    return '1';
  }

  return String(Math.min(parsedValue, max));
}

function findCatalogEntry(
  identifier: string,
  mediaType: MediaType,
  catalog: Record<MediaType, MediaEntry[]>,
): MediaEntry | null {
  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier) {
    return null;
  }

  const normalizedIdentifier = normalizeSlug(trimmedIdentifier);
  return (
    catalog[mediaType].find((entry) => {
      return (
        entry.tmdbId === trimmedIdentifier ||
        entry.slug === normalizedIdentifier ||
        entry.aliases.includes(normalizedIdentifier)
      );
    }) ?? null
  );
}

export function HomePage({ catalog }: HomePageProps) {
  const [identifier, setIdentifier] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [season, setSeason] = useState('1');
  const [episode, setEpisode] = useState('1');
  const [metadataLookup, setMetadataLookup] = useState<MetadataLookupState | null>(null);
  const router = useRouter();

  const trimmedIdentifier = identifier.trim();
  const deferredIdentifier = useDeferredValue(trimmedIdentifier);
  const resolvedEntry = findCatalogEntry(trimmedIdentifier, mediaType, catalog);
  const currentLookupKey = `${mediaType}:${trimmedIdentifier}`;
  const isManualTmdbId = /^\d+$/.test(trimmedIdentifier) && !resolvedEntry;
  const shouldHydrateCatalogSeries = Boolean(resolvedEntry && isTvEntry(resolvedEntry));
  const hydratedEntry = metadataLookup?.key === currentLookupKey ? metadataLookup.entry : null;
  const metadataLookupError = metadataLookup?.key === currentLookupKey ? metadataLookup.error : null;
  const isMetadataLookupLoading = (isManualTmdbId || shouldHydrateCatalogSeries) && metadataLookup?.key !== currentLookupKey;
  const activeEntry = hydratedEntry ?? resolvedEntry;
  const selectedSeries = activeEntry && isTvEntry(activeEntry) ? activeEntry : null;
  const safeSeason = selectedSeries ? clampPositiveInteger(season, selectedSeries.maxSeasons) : season;
  const selectedEpisodeLimit = selectedSeries ? getEpisodeLimit(selectedSeries, safeSeason) : undefined;
  const safeEpisode = selectedSeries && selectedEpisodeLimit ? clampPositiveInteger(episode, selectedEpisodeLimit) : episode;
  const canSubmit = Boolean(trimmedIdentifier) && Boolean(activeEntry);
  const seasonOptions = selectedSeries
    ? Array.from({ length: selectedSeries.maxSeasons }, (_, index) => String(index + 1))
    : ['1'];
  const episodeOptions = selectedEpisodeLimit
    ? Array.from({ length: selectedEpisodeLimit }, (_, index) => String(index + 1))
    : ['1'];

  useEffect(() => {
    if (!deferredIdentifier) {
      return;
    }

    const abortController = new AbortController();
    const lookupKey = `${mediaType}:${deferredIdentifier}`;
    let requestPath: string | null = null;

    if (resolvedEntry && isTvEntry(resolvedEntry)) {
      requestPath = `/api/media/${encodeURIComponent(resolvedEntry.slug)}?hydrate=tmdb`;
    } else if (/^\d+$/.test(deferredIdentifier)) {
      requestPath = `/api/media/${encodeURIComponent(deferredIdentifier)}?type=${mediaType}`;
    }

    if (!requestPath) {
      return;
    }

    void fetch(requestPath, {
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setMetadataLookup({
            entry: null,
            error: payload?.error || 'Unable to resolve this TMDB ID right now.',
            key: lookupKey,
          });
          return;
        }

        const payload = (await response.json()) as { data: MediaEntry; metadataError?: string };
        setMetadataLookup({
          entry: payload.data,
          error: payload.metadataError || null,
          key: lookupKey,
        });
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }

        setMetadataLookup({
          entry: null,
          error: 'Unable to reach the TMDB lookup route right now.',
          key: lookupKey,
        });
      });

    return () => {
      abortController.abort();
    };
  }, [deferredIdentifier, mediaType, resolvedEntry]);

  const handleWatch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const watchTarget = resolvedEntry?.slug ?? trimmedIdentifier;
    const watchType = activeEntry?.type ?? mediaType;
    const queryParams = new URLSearchParams();

    if (!resolvedEntry) {
      queryParams.set('type', watchType);
    }

    if (watchType === 'tv') {
      queryParams.set('s', safeSeason);
      queryParams.set('e', safeEpisode);
    }

    const queryString = queryParams.toString();
    router.push(`/watch/${encodeURIComponent(watchTarget)}${queryString ? `?${queryString}` : ''}`);
  };

  const handleCatalogClick = (entry: MediaEntry) => {
    setMediaType(entry.type);
    setIdentifier(entry.slug);
    if (isTvEntry(entry)) {
      setSeason('1');
      setEpisode('1');
    }
  };

  const handleSeasonChange = (nextSeason: string) => {
    setSeason(nextSeason);

    if (!selectedSeries) {
      return;
    }

    setEpisode((currentEpisode) => clampPositiveInteger(currentEpisode, getEpisodeLimit(selectedSeries, nextSeason)));
  };

  const handleEpisodeChange = (nextEpisode: string) => {
    setEpisode(nextEpisode);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] p-6 text-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="z-10 grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
      >
        <div className="glass flex h-fit flex-col gap-6 rounded-2xl p-8">
          <div className="text-center md:text-left">
            <h1 className="mb-2 text-4xl font-black tracking-tight text-netflix-red md:text-5xl">
              MOVIE DB
            </h1>
            <p className="text-sm leading-relaxed text-gray-400">
              Launch Vidking from readable slugs first, with TMDB ID fallback when you need it.
            </p>
          </div>

          <form onSubmit={handleWatch} className="flex flex-col gap-4">
            <div className="glass mb-2 flex gap-2 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setMediaType('movie')}
                className={`flex-1 rounded-md py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  mediaType === 'movie' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
                }`}
              >
                Movie
              </button>
              <button
                type="button"
                onClick={() => setMediaType('tv')}
                className={`flex-1 rounded-md py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  mediaType === 'tv' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
                }`}
              >
                TV Series
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="media-identifier" className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Media Slug or TMDB ID
              </label>
              <input
                id="media-identifier"
                type="text"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder={mediaType === 'movie' ? 'the-great-dictator or 914' : 'law-and-order-svu or 2734'}
                className="input-glass w-full rounded-lg px-4 py-3 text-sm text-white transition-all focus:outline-none"
                title="Enter a readable slug from the catalog or a TMDB ID"
                required
              />
            </div>

            {trimmedIdentifier && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                {activeEntry ? (
                  <div className="flex flex-col gap-2 text-white">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-400">
                        {resolvedEntry ? 'Catalog entry' : 'TMDB lookup'}
                      </span>
                      <span className="font-bold">{activeEntry.title}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-wider text-gray-400">
                      <span className="flex items-center gap-1">
                        <Link2 className="h-3.5 w-3.5" />
                        {activeEntry.slug}
                      </span>
                      <span>TMDB {activeEntry.tmdbId}</span>
                    </div>
                    {isTvEntry(activeEntry) && (
                      <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                        <span>{activeEntry.maxSeasons} seasons</span>
                        <span>
                          Season {safeSeason} has {selectedEpisodeLimit ?? activeEntry.maxEpisodes} episodes
                        </span>
                      </div>
                    )}
                  </div>
                ) : isMetadataLookupLoading ? (
                  <div className="flex items-center justify-between gap-3 text-white">
                    <span className="text-gray-400">TMDB lookup</span>
                    <span className="font-bold">Resolving metadata...</span>
                  </div>
                ) : metadataLookupError ? (
                  <div className="flex flex-col gap-2 text-white">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-400">TMDB lookup</span>
                      <span className="font-bold text-amber-300">Unavailable</span>
                    </div>
                    <p className="text-xs leading-relaxed text-amber-200">{metadataLookupError}</p>
                  </div>
                ) : isManualTmdbId ? (
                  <div className="flex items-center justify-between gap-3 text-white">
                    <span className="text-gray-400">TMDB lookup</span>
                    <span className="font-bold">{trimmedIdentifier}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 text-white">
                    <span className="text-gray-400">Catalog status</span>
                    <span className="font-bold text-amber-300">Slug not found</span>
                  </div>
                )}
              </div>
            )}

            {mediaType === 'tv' && (
              <div className="flex gap-4">
                <div className="flex flex-1 flex-col gap-2">
                  <label htmlFor="season-select" className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Season
                  </label>
                  <select
                    id="season-select"
                    value={safeSeason}
                    onChange={(event) => handleSeasonChange(event.target.value)}
                    className="input-glass w-full rounded-lg px-4 py-3 text-sm text-white transition-all focus:outline-none"
                    title="Choose the season"
                    required
                  >
                    {seasonOptions.map((seasonNumber) => (
                      <option key={seasonNumber} value={seasonNumber} className="bg-[#111111] text-white">
                        Season {seasonNumber}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <label htmlFor="episode-select" className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Episode {selectedSeries ? `for Season ${safeSeason}` : ''}
                  </label>
                  <select
                    id="episode-select"
                    value={safeEpisode}
                    onChange={(event) => handleEpisodeChange(event.target.value)}
                    className="input-glass w-full rounded-lg px-4 py-3 text-sm text-white transition-all focus:outline-none"
                    title="Choose the episode"
                    required
                  >
                    {episodeOptions.map((episodeNumber) => (
                      <option key={episodeNumber} value={episodeNumber} className="bg-[#111111] text-white">
                        Episode {episodeNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-netflix-red py-3 text-sm font-bold uppercase tracking-wider shadow-lg shadow-red-900/20 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit}
            >
              <Play className="h-4 w-4 fill-current" />
              Load Player
            </button>
          </form>

          <div className="text-center text-xs text-gray-500 md:text-left">
            Catalog entries resolve by slug. Numeric TMDB IDs now resolve real metadata before playback.
          </div>
        </div>

        <div className="glass flex flex-col gap-6 rounded-2xl p-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Curated Catalog</h2>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-gray-400">
                <Tv className="h-4 w-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">TV Series</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {catalog.tv.map((entry) => (
                  <button
                    key={entry.tmdbId}
                    type="button"
                    onClick={() => handleCatalogClick(entry)}
                    className="flex flex-col items-start gap-2 rounded-lg border border-white/5 p-3 text-left transition-all hover:border-white/20 hover:bg-white/5"
                  >
                    <span className="w-full truncate text-sm font-semibold" title={entry.title}>
                      {entry.title}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                      slug: {entry.slug}
                    </span>
                    <span className="text-[10px] font-mono text-gray-500">TMDB ID: {entry.tmdbId}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-gray-400">
                <Film className="h-4 w-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Movies</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {catalog.movie.map((entry) => (
                  <button
                    key={entry.tmdbId}
                    type="button"
                    onClick={() => handleCatalogClick(entry)}
                    className="flex flex-col items-start gap-2 rounded-lg border border-white/5 p-3 text-left transition-all hover:border-white/20 hover:bg-white/5"
                  >
                    <span className="w-full truncate text-sm font-semibold" title={entry.title}>
                      {entry.title}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                      slug: {entry.slug}
                    </span>
                    <span className="text-[10px] font-mono text-gray-500">TMDB ID: {entry.tmdbId}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </main>
  );
}