import 'server-only';

import { prisma } from '@/lib/db';

const TMDB_API_BASE_URL = process.env.TMDB_API_BASE_URL?.trim() || 'https://api.themoviedb.org/3';

interface TmdbImdbResponse {
  imdb_id: string | null;
}

function buildTmdbUrl(tmdbId: string, type: string): string {
  return `${TMDB_API_BASE_URL}/${type}/${encodeURIComponent(tmdbId)}`;
}

function buildTmdbHeaders(): HeadersInit {
  const bearerToken = process.env.TMDB_API_TOKEN?.trim();
  const apiKey = process.env.TMDB_API_KEY?.trim();

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  } else if (apiKey) {
    // api_key will be added as query param
  }

  return headers;
}

function buildTmdbQueryParams(): string {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  const bearerToken = process.env.TMDB_API_TOKEN?.trim();
  const params = new URLSearchParams();

  if (!bearerToken && apiKey) {
    params.set('api_key', apiKey);
  }

  return params.toString();
}

async function fetchImdbIdFromTmdb(tmdbId: string, type: string): Promise<string | null> {
  try {
    const queryString = buildTmdbQueryParams();
    const url = queryString ? `${buildTmdbUrl(tmdbId, type)}?${queryString}` : buildTmdbUrl(tmdbId, type);

    const response = await fetch(url, {
      headers: buildTmdbHeaders(),
      next: {
        revalidate: 86400,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as TmdbImdbResponse;
    return data.imdb_id ?? null;
  } catch {
    return null;
  }
}

export async function resolveStreamimdbId(tmdbId: string, type: string): Promise<string | null> {
  if (!tmdbId) {
    return null;
  }

  const normalizedType = type === 'tv' ? 'tv' : 'movie';

  try {
    const existing = await prisma.tmdbImdbMapping.findUnique({
      where: {
        tmdbId_type: {
          tmdbId,
          type: normalizedType,
        },
      },
    });

    if (existing) {
      return existing.imdbId;
    }
  } catch {
    // DB unavailable; continue to TMDB lookup
  }

  const imdbId = await fetchImdbIdFromTmdb(tmdbId, normalizedType);

  if (!imdbId) {
    return null;
  }

  try {
    await prisma.tmdbImdbMapping.upsert({
      where: {
        tmdbId_type: {
          tmdbId,
          type: normalizedType,
        },
      },
      create: {
        imdbId,
        tmdbId,
        type: normalizedType,
      },
      update: {
        imdbId,
      },
    });
  } catch {
    // Cache write failed; return the IMDB ID anyway
  }

  return imdbId;
}
