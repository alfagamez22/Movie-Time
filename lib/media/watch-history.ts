import { deleteRecord, findRecord, findRecords, saveRecord, stableRecordId, type AppRecord } from '@/lib/db/records';

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
  existingWatchedAt = 0,
): MergeDecision {
  if (!existing) {
    return { isNewer: true, merged: incoming };
  }

  if (existingWatchedAt > 0 && incomingWatchedAt < existingWatchedAt) {
    return { isNewer: false, merged: existing };
  }

  const existingPercent = existing.progressPercent ?? 0;
  const incomingPercent = incoming.progressPercent ?? 0;
  const percentDrop = existingPercent - incomingPercent;
  const secondsDrop = existing.progressSeconds - incoming.progressSeconds;
  const isStale = percentDrop > PROGRESS_DROP_PERCENT || secondsDrop > PROGRESS_MERGE_EPSILON_SECONDS * 5;

  if (isStale) {
    if (existingWatchedAt > 0 && incomingWatchedAt > existingWatchedAt && incoming.progressSeconds > 0) {
      return { isNewer: true, merged: incoming };
    }
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
  record: AppRecord;
  progress: AppRecord;
}

export async function upsertWatchHistoryWithProgress(
  userId: string,
  entry: WatchEntry,
  experience: string,
): Promise<UpsertHistoryResult> {
  const normalized = normalizeProgress(entry);
  const incomingWatchedAtMs = typeof entry.watchedAt === 'number' && Number.isFinite(entry.watchedAt) &&
    entry.watchedAt > 0 && entry.watchedAt <= Date.now() + 60_000
    ? entry.watchedAt : Date.now();
  const watchedAt = new Date(incomingWatchedAtMs);
  const completed = isCompleted(normalized.progressPercent, normalized.progressSeconds, normalized.durationSeconds);

  const progressKey = {
    userId,
    mediaId: entry.id,
    mediaProvider: entry.provider,
    mediaType: entry.type,
    season: entry.season ?? '',
    episode: entry.episode ?? '',
  };
  const historyKey = {
    userId,
    mediaId: entry.id,
    mediaProvider: entry.provider,
    mediaType: entry.type,
  };
  const [existingProgress, existingHistory] = await Promise.all([
    findRecord<AppRecord & {
      id: string; durationSeconds: number | null; progressPercent: number; progressSeconds: number;
      posterUrl: string | null; backdropUrl: string | null; completed: boolean;
    }>('watchProgress', progressKey),
    findRecord<AppRecord & { id: string }>('watchHistory', historyKey),
  ]);

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
    existingProgress?.watchedAt ? new Date(existingProgress.watchedAt as string).getTime() : 0,
  );

  const now = new Date().toISOString();
  const previousHistoryWatchedAt = existingHistory?.watchedAt
    ? new Date(existingHistory.watchedAt as string).getTime()
    : 0;
  const historyWatchedAt = previousHistoryWatchedAt > incomingWatchedAtMs
    ? new Date(previousHistoryWatchedAt).toISOString()
    : watchedAt.toISOString();
  const progressWatchedAt = decision.isNewer ? watchedAt.toISOString() :
    (existingProgress?.watchedAt as string | undefined) ?? watchedAt.toISOString();
  const record = await saveRecord('watchHistory', existingHistory?.id ?? stableRecordId(...Object.values(historyKey)), {
    ...existingHistory,
    ...historyKey,
    experience,
    title: entry.title,
    posterUrl: entry.posterUrl ?? existingProgress?.posterUrl ?? null,
    backdropUrl: entry.backdropUrl ?? existingProgress?.backdropUrl ?? null,
    synopsis: entry.synopsis ?? '',
    rating: entry.rating ?? null,
    year: entry.year ?? null,
    episode: entry.episode ?? null,
    season: entry.season ?? null,
    progressSeconds: decision.merged.progressSeconds,
    progressPercent: decision.merged.progressPercent ?? null,
    durationSeconds: decision.merged.durationSeconds ?? null,
    anilistId: entry.anilistId ?? null,
    malId: entry.malId ?? null,
    animeFormat: entry.animeFormat ?? null,
    defaultLanguage: entry.defaultLanguage ?? null,
    episodeCount: entry.episodeCount ?? null,
    watchedAt: historyWatchedAt,
    createdAt: existingHistory?.createdAt ?? now,
    updatedAt: now,
  }) as AppRecord;

  const progressRecord = await saveRecord('watchProgress', existingProgress?.id ?? stableRecordId(...Object.values(progressKey)), {
    ...existingProgress,
    ...progressKey,
    experience,
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
    watchedAt: progressWatchedAt,
    createdAt: existingProgress?.createdAt ?? now,
    updatedAt: now,
  }) as AppRecord;

  return { record, progress: progressRecord };
}

export async function deleteWatchHistoryForUser(
  userId: string,
  mediaId: string,
  mediaProvider: string,
  mediaType: string,
): Promise<void> {
  const key = { userId, mediaId, mediaProvider, mediaType };
  const history = await findRecord<AppRecord & { id: string }>('watchHistory', key);
  const progress = await findRecords<AppRecord & { id: string }>('watchProgress', key);
  if (history) await deleteRecord('watchHistory', history.id);
  await Promise.all(progress.map((item) => deleteRecord('watchProgress', item.id)));
}
