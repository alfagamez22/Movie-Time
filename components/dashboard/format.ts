export const EXPERIENCE_LABELS: Record<string, string> = {
  papianime: 'PapiAnime',
  papiflix: 'PapiFlix',
  papimanga: 'PapiManga',
};

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function episodeLabel(season: string | null, episode: string | null): string | null {
  if (!episode) return null;
  return season ? `S${season} · E${episode}` : `E${episode}`;
}
