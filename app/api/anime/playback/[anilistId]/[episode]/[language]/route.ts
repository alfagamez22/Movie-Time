import { NextResponse } from 'next/server';

import { lookupAnimeMediaEntry } from '@/lib/anime/client';
import { AnimePlaybackError, resolveAnimePlayback } from '@/lib/anime/vidnest';

interface AnimePlaybackRouteContext {
  params: Promise<{
    anilistId: string;
    episode: string;
    language: string;
  }>;
}

export async function GET(request: Request, context: AnimePlaybackRouteContext) {
  const { anilistId, episode, language } = await context.params;
  const requestUrl = new URL(request.url);
  const preferredServer = requestUrl.searchParams.get('server');
  const normalizedLanguage = language === 'dub' ? 'dub' : language === 'sub' ? 'sub' : null;
  const parsedEpisode = Number.parseInt(episode, 10);

  if (!normalizedLanguage) {
    return NextResponse.json({ error: 'Invalid anime playback language.' }, { status: 400 });
  }

  if (!Number.isFinite(parsedEpisode) || parsedEpisode < 1) {
    return NextResponse.json({ error: 'Episode must be a positive integer.' }, { status: 400 });
  }

  const lookup = await lookupAnimeMediaEntry(anilistId);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.message }, { status: lookup.status });
  }

  try {
    const data = await resolveAnimePlayback({
      anilistId: lookup.entry.id,
      episode: parsedEpisode,
      language: normalizedLanguage,
      metadata: {
        posterUrl: lookup.entry.posterUrl,
        title: lookup.entry.title,
      },
      preferredServer: preferredServer === 'aniwave' ? 'aniwave' : undefined,
    });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof AnimePlaybackError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }
}
