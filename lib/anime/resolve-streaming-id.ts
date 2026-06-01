import 'server-only';

import { searchAnilistAnime } from '@/lib/anime/anilist';
import { cleanText } from '@/lib/anime/episodes';

// ---------------------------------------------------------------------------
// Title-based cross-ID resolver
// ---------------------------------------------------------------------------
//
// Maps external anime IDs (Kitsu, MAL) to AniList IDs so the VidNest streaming
// pipeline (which is AniList-driven) can resolve the same title regardless of
// which catalog the user browsed in. There is no static lookup table — we
// score AniList search results by title similarity and pick the strongest
// candidate. Caching the lookup once per (catalogId, sourceId) pair keeps the
// hot path off AniList search.

export interface ResolvedStreamingId {
  anilistId: string;
  confidence: number;
  matchedTitle: string;
}

interface CacheEntry {
  expiresAt: number;
  value: ResolvedStreamingId | null;
}

const RESOLVER_TTL_MS = 24 * 60 * 60 * 1000; // 24h — title-to-AniList mapping is stable
const resolverCache = new Map<string, CacheEntry>();

export interface ResolveAnilistIdOptions {
  externalTitle: string;
  externalYear?: number;
  fallbackId?: string;
  revalidateSeconds?: number;
}

function normalizeForMatching(value: string | null | undefined): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, '')
    .replace(/[^a-z0-9ぁ-んァ-ヶ一-鿿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripSeasonSuffix(value: string): string {
  return value
    .replace(/\b(season\s*\d+|part\s*\d+|s\d+|\d+(?:st|nd|rd|th)\s*season)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreTitleMatch(candidate: string, target: string): number {
  if (!candidate || !target) {
    return 0;
  }

  if (candidate === target) {
    return 1;
  }

  if (candidate.includes(target) || target.includes(candidate)) {
    const shorterLength = Math.min(candidate.length, target.length);
    const longerLength = Math.max(candidate.length, target.length);
    return shorterLength / longerLength;
  }

  const candidateTokens = new Set(candidate.split(' ').filter(Boolean));
  const targetTokens = new Set(target.split(' ').filter(Boolean));
  const intersection = Array.from(candidateTokens).filter((token) => targetTokens.has(token));
  const unionSize = new Set([...candidateTokens, ...targetTokens]).size;

  if (unionSize === 0) {
    return 0;
  }

  return intersection.length / unionSize;
}

const MIN_MATCH_CONFIDENCE = 0.55;

export async function resolveAnilistIdByTitle(
  options: ResolveAnilistIdOptions,
): Promise<ResolvedStreamingId | null> {
  const normalizedTitle = normalizeForMatching(options.externalTitle);
  if (!normalizedTitle) {
    return null;
  }

  const cacheKey = [
    normalizeForMatching(options.externalTitle),
    options.externalYear ?? '',
    options.fallbackId ?? '',
  ].join('::');
  const cached = resolverCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const candidate = await searchAnilistAnime(options.externalTitle, 5);
  const revalidateSeconds = options.revalidateSeconds ?? 3600;

  if (candidate.length === 0) {
    const fallback = options.fallbackId
      ? { anilistId: options.fallbackId, confidence: 0, matchedTitle: options.externalTitle }
      : null;
    resolverCache.set(cacheKey, { expiresAt: Date.now() + RESOLVER_TTL_MS, value: fallback });
    return fallback;
  }

  const targetStripped = stripSeasonSuffix(normalizedTitle);
  let best: { confidence: number; entry: (typeof candidate)[number]; matchedTitle: string } | null = null;

  for (const entry of candidate) {
    const candidates = [
      normalizeForMatching(entry.title.userPreferred),
      normalizeForMatching(entry.title.english),
      normalizeForMatching(entry.title.romaji),
      normalizeForMatching(entry.title.native),
    ]
      .map((value) => stripSeasonSuffix(value))
      .filter(Boolean);

    for (const candidateTitle of candidates) {
      const score = Math.max(
        scoreTitleMatch(candidateTitle, normalizedTitle),
        targetStripped !== normalizedTitle ? scoreTitleMatch(candidateTitle, targetStripped) : 0,
      );

      if (score >= MIN_MATCH_CONFIDENCE && (!best || score > best.confidence)) {
        const sourceYear = entry.seasonYear ?? entry.startDate?.year ?? undefined;
        const yearBonus = options.externalYear && sourceYear === options.externalYear ? 0.05 : 0;
        best = {
          confidence: Math.min(1, score + yearBonus),
          entry,
          matchedTitle: entry.title.userPreferred || entry.title.english || entry.title.romaji || '',
        };
      }
    }
  }

  const result: ResolvedStreamingId | null = best
    ? {
        anilistId: String(best.entry.id),
        confidence: best.confidence,
        matchedTitle: best.matchedTitle,
      }
    : options.fallbackId
      ? { anilistId: options.fallbackId, confidence: 0, matchedTitle: options.externalTitle }
      : null;

  resolverCache.set(cacheKey, { expiresAt: Date.now() + RESOLVER_TTL_MS, value: result });
  // Reference revalidateSeconds to keep the signature aligned with other
  // adapter functions; AniList's own GraphQL cache handles the per-query TTL.
  void revalidateSeconds;
  return result;
}

export function clearResolvedStreamingIdCache(): void {
  resolverCache.clear();
}
