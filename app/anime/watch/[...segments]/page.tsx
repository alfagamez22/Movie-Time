import type { Metadata } from 'next';
import Link from 'next/link';

import { AnimeWatchPlayer } from '@/components/media/anime-watch-player';
import { lookupAnimeMediaEntry } from '@/lib/anime/client';
import { papianimeExperience } from '@/lib/media/experience';
import { buildWatchHref } from '@/lib/media/routes';

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
        skipIntro: boolean;
      };
      kind: 'canonical';
      lookup: CanonicalLookupSuccess;
    }
  | {
      kind: 'error';
      message: string;
    };

async function resolveCanonicalState(
  props: AnimeWatchPageProps,
  anilistId: string,
  episode: string,
  language: string,
): Promise<CanonicalState> {
  const searchParams = await props.searchParams;
  const lookup = await lookupAnimeMediaEntry(anilistId);

  if (!lookup.ok) {
    return {
      kind: 'error',
      message: lookup.message,
    };
  }

  const episodeLimit = lookup.seasonDetails?.releasedEpisodeCount ?? lookup.entry.episodeCount ?? 1;
  const parsedEpisode = Math.min(Math.max(1, Number.parseInt(episode, 10) || 1), episodeLimit);
  const parsedLanguage = 'sub' as const;
  const initialPlayback = {
    autoNext: parseBooleanParam(getFirstParam(searchParams.autonext), false),
    autoPlay: parseBooleanParam(getFirstParam(searchParams.autoPlay), true),
    color: 'e50914',
    episode: String(parsedEpisode),
    language: parsedLanguage,
    progress: parseProgressParam(getFirstParam(searchParams.progress)),
    season: '1',
    skipIntro: parseBooleanParam(getFirstParam(searchParams.skipintro), false),
  };
  const canonicalHref = buildWatchHref(lookup.entry, {
    autoNext: initialPlayback.autoNext,
    autoPlay: initialPlayback.autoPlay,
    basePath: papianimeExperience.watchBasePath,
    episode: initialPlayback.episode,
    language: initialPlayback.language,
    progress: initialPlayback.progress,
    skipIntro: initialPlayback.skipIntro,
  });

  return {
    canonicalHref,
    currentPath: `/anime/watch/${encodeURIComponent(anilistId)}/${encodeURIComponent(episode)}/${language}`,
    currentSearch: Object.entries(searchParams).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => Array.isArray(v) ? v.map(vv => `${k}=${vv}`).join('&') : `${k}=${v}`).join('&'),
    initialPlayback,
    kind: 'canonical',
    lookup,
  };
}

export async function generateMetadata(props: AnimeWatchPageProps): Promise<Metadata> {
  const { segments } = await props.params;

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

  if (segments.length === 3) {
    const canonicalState = await resolveCanonicalState(props, segments[0], segments[1], segments[2]);

    if (canonicalState.kind === 'error') {
      return <LookupErrorState message={canonicalState.message} />;
    }

    return (
      <AnimeWatchPlayer
        entry={canonicalState.lookup.entry}
        experience={papianimeExperience}
        initialPlayback={canonicalState.initialPlayback}
        initialSeasonDetails={canonicalState.lookup.seasonDetails}
      />
    );
  }

  return <LookupErrorState message="Use the anime library to open a valid watch route." />;
}
