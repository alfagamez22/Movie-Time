import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AnimeWatchPlayer } from '@/components/media/anime-watch-player';
import { lookupAnimeMediaEntry } from '@/lib/anime/client';
import { isAnimePlayerId, type AnimePlayerId } from '@/lib/anime/player-metadata';
import { resolveAnimeMediaEntry } from '@/lib/anime/resolve';
import { resolvePlaybackOptions } from '@/lib/media/embed';
import { papianimeExperience } from '@/lib/media/experience';
import { buildWatchHref, parseAnimePlaybackServer, parsePlaybackLanguage } from '@/lib/media/routes';

interface AnimeWatchPageProps {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type CanonicalLookupSuccess = Extract<Awaited<ReturnType<typeof lookupAnimeMediaEntry>>, { ok: true }>;

function getFirstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseBooleanParam(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value !== 'false' && value !== '0';
}

function parseProgressParam(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseAnimePlayerParam(value: string | undefined): AnimePlayerId {
  return isAnimePlayerId(value) ? value : 'p1';
}

function serializeSearchParams(searchParams: URLSearchParams): string {
  return Array.from(searchParams.entries())
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      return leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function normalizeSearchParams(searchParams: Record<string, string | string[] | undefined>): string {
  const normalized = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item != null) {
          normalized.append(key, item);
        }
      });
      return;
    }

    if (value != null) {
      normalized.set(key, value);
    }
  });

  return serializeSearchParams(normalized);
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

type LegacyState =
  | {
      canonicalHref: string;
      kind: 'legacy';
      lookup: Awaited<ReturnType<typeof resolveAnimeMediaEntry>>;
    }
  | {
      kind: 'error';
      message: string;
    };

type CanonicalState =
  | {
      canonicalHref: string;
      currentPath: string;
      currentSearch: string;
      initialPlayback: {
        autoNext: boolean;
        autoPlay: boolean;
        color: string;
        episode: string;
        language: 'dub' | 'sub';
        progress: number | null;
        season: string;
        player: AnimePlayerId;
        server?: 'aniwave' | 'anitaku';
        skipIntro: boolean;
      };
      kind: 'canonical';
      lookup: CanonicalLookupSuccess;
    }
  | {
      kind: 'error';
      message: string;
    };

async function resolveLegacyState(props: AnimeWatchPageProps, slug: string): Promise<LegacyState> {
  const searchParams = await props.searchParams;
  const identifier = decodeURIComponent(slug);
  const preferredId = getFirstParam(searchParams.id)?.trim();
  const player = parseAnimePlayerParam(getFirstParam(searchParams.player));
  const resolvedEntry = await resolveAnimeMediaEntry(identifier, preferredId);

  if (!resolvedEntry) {
    return {
      kind: 'error',
      message: 'Search for a broader anime title or use the AniList identifier from the search results.',
    };
  }

  const resolvedServer =
    player === 'p2'
      ? undefined
      : parseAnimePlaybackServer(getFirstParam(searchParams.server)) ?? (player === 'p3' ? 'anitaku' : undefined);
  const initialPlayback = {
    ...resolvePlaybackOptions(resolvedEntry.entry, searchParams),
    server: resolvedServer,
  };
  const canonicalHref = buildWatchHref(resolvedEntry.entry, {
    autoNext: initialPlayback.autoNext,
    autoPlay: initialPlayback.autoPlay,
    basePath: papianimeExperience.watchBasePath,
    episode: initialPlayback.episode,
    language: initialPlayback.language,
    progress: initialPlayback.progress,
    player,
    server: initialPlayback.server,
    skipIntro: initialPlayback.skipIntro,
  });

  return {
    canonicalHref,
    kind: 'legacy',
    lookup: resolvedEntry,
  };
}

async function resolveCanonicalState(
  props: AnimeWatchPageProps,
  anilistId: string,
  episode: string,
  language: string,
): Promise<CanonicalState> {
  const searchParams = await props.searchParams;
  const lookup = await lookupAnimeMediaEntry(anilistId);
  const player = parseAnimePlayerParam(getFirstParam(searchParams.player));

  if (!lookup.ok) {
    return {
      kind: 'error',
      message: lookup.message,
    };
  }

  const episodeLimit = lookup.seasonDetails?.releasedEpisodeCount ?? lookup.entry.episodeCount ?? 1;
  const parsedEpisode = Math.min(Math.max(1, Number.parseInt(episode, 10) || 1), episodeLimit);
  const parsedLanguage = (parsePlaybackLanguage(language) ?? lookup.entry.defaultLanguage ?? 'sub') as 'dub' | 'sub';
  const resolvedServer =
    player === 'p2'
      ? undefined
      : parseAnimePlaybackServer(getFirstParam(searchParams.server)) ?? (player === 'p3' ? 'anitaku' : undefined);
  const initialPlayback = {
    autoNext: parseBooleanParam(getFirstParam(searchParams.autonext), true),
    autoPlay: parseBooleanParam(getFirstParam(searchParams.autoPlay), true),
    color: 'e50914',
    episode: String(parsedEpisode),
    language: parsedLanguage,
    progress: parseProgressParam(getFirstParam(searchParams.progress)),
    season: '1',
    player,
    server: resolvedServer,
    skipIntro: parseBooleanParam(getFirstParam(searchParams.skipintro), false),
  };
  const canonicalHref = buildWatchHref(lookup.entry, {
    autoNext: initialPlayback.autoNext,
    autoPlay: initialPlayback.autoPlay,
    basePath: papianimeExperience.watchBasePath,
    episode: initialPlayback.episode,
    language: initialPlayback.language,
    progress: initialPlayback.progress,
    player,
    server: initialPlayback.server,
    skipIntro: initialPlayback.skipIntro,
  });

  return {
    canonicalHref,
    currentPath: `/anime/watch/${encodeURIComponent(anilistId)}/${encodeURIComponent(episode)}/${language}`,
    currentSearch: normalizeSearchParams(searchParams),
    initialPlayback,
    kind: 'canonical',
    lookup,
  };
}

export async function generateMetadata(props: AnimeWatchPageProps): Promise<Metadata> {
  const { segments } = await props.params;

  if (segments.length === 1) {
    const legacyState = await resolveLegacyState(props, segments[0]);
    if (legacyState.kind === 'error' || !legacyState.lookup) {
      return {};
    }

    const searchParams = await props.searchParams;
    const playback = resolvePlaybackOptions(legacyState.lookup.entry, searchParams);

    return {
      description: legacyState.lookup.entry.synopsis || undefined,
      title: `${legacyState.lookup.entry.title} Episode ${playback.episode.padStart(2, '0')}`,
    };
  }

  if (segments.length === 3) {
    const canonicalState = await resolveCanonicalState(props, segments[0], segments[1], segments[2]);
    if (canonicalState.kind === 'error') {
      return {};
    }

    return {
      description: canonicalState.lookup.entry.synopsis || undefined,
      title:
        canonicalState.lookup.entry.type === 'tv'
          ? `${canonicalState.lookup.entry.title} Episode ${canonicalState.initialPlayback.episode.padStart(2, '0')}`
          : canonicalState.lookup.entry.title,
    };
  }

  return {};
}

export default async function AnimeWatchPage(props: AnimeWatchPageProps) {
  const { segments } = await props.params;

  if (segments.length === 1) {
    const legacyState = await resolveLegacyState(props, segments[0]);

    if (legacyState.kind === 'error') {
      return <LookupErrorState message={legacyState.message} />;
    }

    redirect(legacyState.canonicalHref);
  }

  if (segments.length === 3) {
    const canonicalState = await resolveCanonicalState(props, segments[0], segments[1], segments[2]);

    if (canonicalState.kind === 'error') {
      return <LookupErrorState message={canonicalState.message} />;
    }

    const canonicalUrl = new URL(canonicalState.canonicalHref, 'http://localhost');
    const canonicalSearch = serializeSearchParams(canonicalUrl.searchParams);

    if (canonicalState.currentPath !== canonicalUrl.pathname || canonicalState.currentSearch !== canonicalSearch) {
      redirect(canonicalState.canonicalHref);
    }

    return (
      <AnimeWatchPlayer
        entry={canonicalState.lookup.entry}
        animePlayer={canonicalState.initialPlayback.player}
        experience={papianimeExperience}
        initialPlayback={canonicalState.initialPlayback}
        initialSeasonDetails={canonicalState.lookup.seasonDetails}
      />
    );
  }

  return <LookupErrorState message="Use the anime library to open a valid watch route." />;
}
