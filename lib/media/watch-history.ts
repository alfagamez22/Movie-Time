import { prisma } from '@/lib/db';

import type { Prisma } from '@/lib/generated/prisma/client';

export const MAX_WATCH_HISTORY_ENTRIES = 24;
export const PROGRESS_MERGE_EPSILON_SECONDS = 2;
export const PROGRESS_DROP_PERCENT = 5;

export type WatchEntry = {
  id: string;
  title: string;
  provider: string;
  type: string;
  experience: string;
  episode?: string;
  season?: string;
  progressSeconds?: number;
  progressPercent?: number;
  durationSeconds?: number;
  posterUrl?: string;
  backdropUrl?: string;
  synopsis?: string;
  rating?: number;
  year?: number;
  anilistId?: string;
  malId?: string;
  animeFormat?: string;
  defaultLanguage?: string;
  episodeCount?: number;
  watchedAt?: number;
};

function sanitizeNonNegativeInt(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function sanitizePercent(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function isCompleted(progressPercent: number | undefined, progressSeconds: number | undefined, durationSeconds: number | undefined): boolean {
  if (typeof progressPercent === 'number' && progressPercent >= 95) return true;
  if (
    typeof durationSeconds === 'number' &&
    durationSeconds > 0 &&
    typeof progressSeconds === 'number' &&
    progressSeconds >= Math.max(durationSeconds * 0.95, durationSeconds - 30)
  ) {
    return true;
  }
  return false;
}

export interface NormalizedProgressFields {
  durationSeconds: number | undefined;
  progressPercent: number | undefined;
  progressSeconds: number;
}

export function normalizeProgress(input: WatchEntry): NormalizedProgressFields {
  const progressSeconds = sanitizeNonNegativeInt(input.progressSeconds) ?? 0;
  const progressPercent = sanitizePercent(input.progressPercent);
  const durationSeconds = sanitizeNonNegativeInt(input.durationSeconds);

  return {
    durationSeconds,
    progressPercent,
    progressSeconds,
  };
}

export interface MergeDecision {
  isNewer: boolean;
  merged: NormalizedProgressFields;
}

export function shouldApplyIncomingProgress(
  existing: NormalizedProgressFields | null,
  incoming: NormalizedProgressFields,
  incomingWatchedAt: number,
): MergeDecision {
  if (!existing) {
    return { isNewer: true, merged: incoming };
  }

  const existingPercent = existing.progressPercent ?? 0;
  const incomingPercent = incoming.progressPercent ?? 0;
  const percentDrop = existingPercent - incomingPercent;
  const secondsDrop = existing.progressSeconds - incoming.progressSeconds;
  const isStale = percentDrop > PROGRESS_DROP_PERCENT || secondsDrop > PROGRESS_MERGE_EPSILON_SECONDS * 5;

  if (isStale) {
    return { isNewer: false, merged: existing };
  }

  const merged: NormalizedProgressFields = {
    durationSeconds: incoming.durationSeconds ?? existing.durationSeconds,
    progressPercent: Math.max(existingPercent, incomingPercent),
    progressSeconds: Math.max(existing.progressSeconds, incoming.progressSeconds),
  };

  return {
    isNewer: incomingWatchedAt > 0,
    merged,
  };
}

export interface UpsertHistoryResult {
  record: Awaited<ReturnType<typeof prisma.watchHistory.upsert>>;
  progress: Awaited<ReturnType<typeof prisma.watchProgress.upsert>> | null;
}

function buildHistoryCreateData(userId: string, entry: WatchEntry, experience: string): Prisma.WatchHistoryCreateInput {
  return {
    user: { connect: { id: userId } },
    mediaId: entry.id,
    mediaType: entry.type,
    mediaProvider: entry.provider,
    experience,
    title: entry.title,
    posterUrl: entry.posterUrl ?? null,
    backdropUrl: entry.backdropUrl ?? null,
    synopsis: entry.synopsis ?? '',
    rating: entry.rating ?? null,
    year: entry.year ?? null,
    episode: entry.episode ?? null,
    season: entry.season ?? null,
    progressSeconds: entry.progressSeconds ?? null,
    progressPercent: entry.progressPercent ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    anilistId: entry.anilistId ?? null,
    malId: entry.malId ?? null,
    animeFormat: entry.animeFormat ?? null,
    defaultLanguage: entry.defaultLanguage ?? null,
    episodeCount: entry.episodeCount ?? null,
    watchedAt: entry.watchedAt ? new Date(entry.watchedAt) : new Date(),
  };
}

function buildProgressCreateData(
  userId: string,
  entry: WatchEntry,
  experience: string,
  progress: NormalizedProgressFields,
  completed: boolean,
): Prisma.WatchProgressCreateInput {
  return {
    user: { connect: { id: userId } },
    mediaId: entry.id,
    mediaType: entry.type,
    mediaProvider: entry.provider,
    experience,
    season: entry.season ?? '',
    episode: entry.episode ?? '',
    title: entry.title,
    posterUrl: entry.posterUrl ?? null,
    backdropUrl: entry.backdropUrl ?? null,
    rating: entry.rating ?? null,
    year: entry.year ?? null,
    progressSeconds: progress.progressSeconds,
    progressPercent: progress.progressPercent ?? 0,
    durationSeconds: progress.durationSeconds ?? null,
    completed,
    anilistId: entry.anilistId ?? null,
    malId: entry.malId ?? null,
    animeFormat: entry.animeFormat ?? null,
    defaultLanguage: entry.defaultLanguage ?? null,
    watchedAt: entry.watchedAt ? new Date(entry.watchedAt) : new Date(),
  };
}

export async function upsertWatchHistoryWithProgress(
  userId: string,
  entry: WatchEntry,
  experience: string,
): Promise<UpsertHistoryResult> {
  const normalized = normalizeProgress(entry);
  const watchedAt = entry.watchedAt ? new Date(entry.watchedAt) : new Date();
  const incomingWatchedAtMs = entry.watchedAt ?? Date.now();
  const completed = isCompleted(normalized.progressPercent, normalized.progressSeconds, normalized.durationSeconds);

  const existingProgress = await prisma.watchProgress.findUnique({
    where: {
      userId_mediaId_mediaProvider_mediaType_season_episode: {
        userId,
        mediaId: entry.id,
        mediaProvider: entry.provider,
        mediaType: entry.type,
        season: entry.season ?? '',
        episode: entry.episode ?? '',
      },
    },
  });

  const decision = shouldApplyIncomingProgress(
    existingProgress
      ? {
          durationSeconds: existingProgress.durationSeconds ?? undefined,
          progressPercent: existingProgress.progressPercent,
          progressSeconds: existingProgress.progressSeconds,
        }
      : null,
    normalized,
    incomingWatchedAtMs,
  );

  const record = await prisma.watchHistory.upsert({
    where: {
      userId_mediaId_mediaProvider_mediaType: {
        userId,
        mediaId: entry.id,
        mediaProvider: entry.provider,
        mediaType: entry.type,
      },
    },
    update: {
      episode: entry.episode ?? null,
      season: entry.season ?? null,
      progressSeconds: decision.merged.progressSeconds,
      progressPercent: decision.merged.progressPercent ?? null,
      durationSeconds: decision.merged.durationSeconds ?? null,
      posterUrl: entry.posterUrl ?? existingProgress?.posterUrl ?? null,
      backdropUrl: entry.backdropUrl ?? existingProgress?.backdropUrl ?? null,
      synopsis: entry.synopsis ?? '',
      rating: entry.rating ?? null,
      year: entry.year ?? null,
      anilistId: entry.anilistId ?? null,
      malId: entry.malId ?? null,
      animeFormat: entry.animeFormat ?? null,
      defaultLanguage: entry.defaultLanguage ?? null,
      episodeCount: entry.episodeCount ?? null,
      watchedAt,
      updatedAt: new Date(),
    },
    create: buildHistoryCreateData(userId, entry, experience),
  });

  const progressRecord = await prisma.watchProgress.upsert({
    where: {
      userId_mediaId_mediaProvider_mediaType_season_episode: {
        userId,
        mediaId: entry.id,
        mediaProvider: entry.provider,
        mediaType: entry.type,
        season: entry.season ?? '',
        episode: entry.episode ?? '',
      },
    },
    update: {
      title: entry.title,
      posterUrl: entry.posterUrl ?? null,
      backdropUrl: entry.backdropUrl ?? null,
      rating: entry.rating ?? null,
      year: entry.year ?? null,
      progressSeconds: decision.merged.progressSeconds,
      progressPercent: decision.merged.progressPercent ?? 0,
      durationSeconds: decision.merged.durationSeconds ?? null,
      completed: completed || existingProgress?.completed === true,
      anilistId: entry.anilistId ?? null,
      malId: entry.malId ?? null,
      animeFormat: entry.animeFormat ?? null,
      defaultLanguage: entry.defaultLanguage ?? null,
      watchedAt,
      updatedAt: new Date(),
    },
    create: buildProgressCreateData(userId, entry, experience, decision.merged, completed),
  });

  return { record, progress: progressRecord };
}

export async function deleteWatchHistoryForUser(
  userId: string,
  mediaId: string,
  mediaProvider: string,
  mediaType: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.watchHistory.delete({
      where: {
        userId_mediaId_mediaProvider_mediaType: {
          userId,
          mediaId,
          mediaProvider,
          mediaType,
        },
      },
    }),
    prisma.watchProgress.deleteMany({
      where: {
        userId,
        mediaId,
        mediaProvider,
        mediaType,
      },
    }),
  ]);
}
