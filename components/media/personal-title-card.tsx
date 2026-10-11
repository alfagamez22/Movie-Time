'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Info, Play, X } from 'lucide-react';
import { buildWatchHref } from '@/lib/media/routes';
import { rememberPlaybackReturn } from '@/lib/media/playback-return';
import { BOOKMARK_STATUSES, BOOKMARK_STATUS_LABELS, type BookmarkStatus } from '@/lib/media/user-actions';
import { getMediaKindLabel, type LibraryMediaEntry, type MediaExperience } from '@/lib/media/types';

export function PersonalTitleCard({ entry, onSelect, onRemove, pending = false, progressPercent, episodeLabel,
  href, playLabel = 'Play', status, onStatusChange, artwork, extraAction, onPlay }: {
  entry: LibraryMediaEntry; onSelect: (entry: LibraryMediaEntry) => void; onRemove?: () => void;
  pending?: boolean; progressPercent?: number; episodeLabel?: string; href?: string; playLabel?: string;
  status?: BookmarkStatus; onStatusChange?: (status: BookmarkStatus) => void; artwork?: string;
  extraAction?: React.ReactNode; onPlay?: () => void;
}) {
  const experience: MediaExperience = entry.provider === 'mangadex' ? 'papimanga' : entry.provider === 'tmdb' ? 'papiflix' : 'papianime';
  const image = artwork ?? entry.backdropUrl ?? entry.posterUrl;
  const actionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded bg-white px-4 text-xs font-bold text-black transition hover:bg-zinc-300';
  return <article aria-label={entry.title} className="group relative min-w-0 rounded-md bg-[#181818] transition-colors hover:bg-[#242424]">
    <div className="relative aspect-video overflow-hidden rounded-t-md bg-zinc-900">
      <button type="button" onClick={() => onSelect(entry)} aria-label={`Details for ${entry.title}`} className="absolute inset-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]">
        {image ? <Image src={image} alt="" fill sizes="(max-width: 640px) 82vw, (max-width: 1024px) 45vw, 320px" className="object-cover transition-transform duration-300 group-hover:scale-105" /> : <span className="flex h-full items-center justify-center px-4 text-center font-bold text-zinc-500">{entry.title}</span>}
        <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
        <span className="absolute bottom-3 left-3 text-[10px] font-black uppercase tracking-[0.12em] text-white">{experience === 'papianime' ? 'PapiAnime' : experience === 'papimanga' ? 'PapiManga' : 'PapiFlix'}</span>
      </button>
      {onRemove ? <button type="button" disabled={pending} onClick={onRemove} aria-label={`Remove ${entry.title}`} title="Remove from this collection"
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/75 text-white ring-1 ring-white/20 transition hover:bg-black disabled:opacity-40"><X className="h-4 w-4" /></button> : null}
    </div>
    {typeof progressPercent === 'number' ? <div role="progressbar" aria-label={`${entry.title} progress`} aria-valuenow={Math.round(Math.min(100, Math.max(0, progressPercent)))} aria-valuemin={0} aria-valuemax={100} className="h-1 bg-zinc-600"><div className="h-full bg-netflix-red" style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }} /></div> : null}
    <div className="space-y-3 p-4">
      <div><h3 className="line-clamp-1 text-sm font-bold text-white" title={entry.title}>{entry.title}</h3>
        <p className="mt-1 truncate text-xs text-zinc-400">{episodeLabel ?? [entry.year, getMediaKindLabel(entry)].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex items-center gap-2">
        {onPlay ? <button type="button" onClick={onPlay} className={actionClass}><Play className="h-3.5 w-3.5 fill-current" />{playLabel}</button> :
          <Link href={href ?? buildWatchHref(entry)} onClick={() => rememberPlaybackReturn(entry, experience)} aria-label={`${playLabel} ${entry.title}`} className={actionClass}><Play className="h-3.5 w-3.5 fill-current" />{playLabel}</Link>}
        <button type="button" onClick={() => onSelect(entry)} aria-label={`More information about ${entry.title}`} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 text-white hover:border-white hover:bg-white/10"><Info className="h-4 w-4" /></button>
        {extraAction}
      </div>
      {status && onStatusChange ? <label className="flex items-center gap-2 border-t border-white/10 pt-3 text-xs text-zinc-400">
        <span>Status</span><select aria-label={`Status for ${entry.title}`} value={status} disabled={pending} onChange={(event) => onStatusChange(event.target.value as BookmarkStatus)}
          className="min-h-10 min-w-0 flex-1 rounded border border-white/20 bg-[#181818] px-2 text-xs text-white focus:outline focus:outline-2 focus:outline-white disabled:opacity-50">
          {BOOKMARK_STATUSES.map((value) => <option value={value} key={value}>{BOOKMARK_STATUS_LABELS[value]}</option>)}
        </select>
      </label> : null}
    </div>
  </article>;
}
