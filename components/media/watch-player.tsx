'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clapperboard, Link2, Settings, Tv } from 'lucide-react';
import { motion } from 'motion/react';

import { buildEmbedUrl, type PlaybackOptions } from '@/lib/media/embed';
import { isTvEntry, type MediaEntry } from '@/lib/media/types';

interface WatchPlayerProps {
  entry: MediaEntry;
  initialPlayback: PlaybackOptions;
  isCatalogEntry: boolean;
}

const PLAYER_COLORS = [
  { label: 'Red', value: 'e50914', swatchClassName: 'bg-netflix-red' },
  { label: 'Blue', value: '0dcaf0', swatchClassName: 'bg-player-blue' },
  { label: 'Green', value: '1db954', swatchClassName: 'bg-player-green' },
  { label: 'Purple', value: '9146ff', swatchClassName: 'bg-player-purple' },
] as const;

export function WatchPlayer({ entry, initialPlayback, isCatalogEntry }: WatchPlayerProps) {
  const router = useRouter();
  const [color, setColor] = useState(initialPlayback.color);
  const [autoPlay, setAutoPlay] = useState(initialPlayback.autoPlay);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') {
        return;
      }

      try {
        const parsedData = JSON.parse(event.data) as {
          type?: string;
          data?: { event?: string; progress?: number };
        };

        if (parsedData.type === 'PLAYER_EVENT' && parsedData.data?.event) {
          const progress = Math.round(parsedData.data.progress || 0);
          setMessage(`Event: ${parsedData.data.event} - Progress: ${progress}%`);
        }
      } catch {
        setMessage(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const embedUrl = buildEmbedUrl(entry, {
    ...initialPlayback,
    color,
    autoPlay,
  });

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] text-white">
      <header className="glass z-50 flex h-16 w-full items-center justify-between px-8">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="group flex items-center gap-2 text-zinc-300 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
          <span className="text-sm font-medium uppercase tracking-widest text-gray-400">Back</span>
        </button>

        <h1 className="hidden text-2xl font-black tracking-tighter text-netflix-red md:block">
          MOVIE DB
        </h1>

        <button
          type="button"
          title="Open player settings"
          aria-label="Open player settings"
          onClick={() => setShowSettings((currentValue) => !currentValue)}
          className="rounded-full p-2 text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Settings className="h-5 w-5" />
        </button>
      </header>

      <main className="relative flex grow flex-col items-center justify-center">
        <div className="mx-auto flex h-full w-full max-w-7xl grow flex-col p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-wider text-gray-400">
            <span className="rounded-full border border-white/10 px-3 py-1">{entry.type}</span>
            <span className="rounded-full border border-white/10 px-3 py-1">TMDB {entry.tmdbId}</span>
            <span className="rounded-full border border-white/10 px-3 py-1">slug {entry.slug}</span>
            {isTvEntry(entry) && (
              <span className="rounded-full border border-white/10 px-3 py-1">
                season {initialPlayback.season} episode {initialPlayback.episode}
              </span>
            )}
            {!isCatalogEntry && (
              <span className="rounded-full border border-amber-400/30 px-3 py-1 text-amber-300">
                manual TMDB route
              </span>
            )}
          </div>

          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="max-w-3xl space-y-2">
              <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">{entry.title}</h2>
              <p className="text-sm leading-relaxed text-zinc-400">{entry.synopsis}</p>
            </div>
            <div className="hidden rounded-2xl border border-white/5 bg-white/5 p-4 text-xs uppercase tracking-widest text-zinc-400 md:block">
              {isTvEntry(entry) ? <Tv className="mb-2 h-4 w-4" /> : <Clapperboard className="mb-2 h-4 w-4" />}
              {isCatalogEntry ? 'catalog-backed route' : 'manual identifier mode'}
            </div>
          </div>

          <div className="player-canvas relative aspect-video w-full overflow-hidden rounded-2xl border border-white/5 shadow-2xl">
            <iframe
              src={embedUrl}
              title={`${entry.title} player`}
              className="absolute inset-0 h-full w-full"
              frameBorder="0"
              allowFullScreen
            ></iframe>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                {entry.slug}
              </span>
              <span>{entry.tmdbId}</span>
            </div>
            {message && (
              <div className="glass rounded-full px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-300">
                {message}
              </div>
            )}
          </div>
        </div>

        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass absolute bottom-4 right-4 z-10 w-full max-w-xs rounded-2xl p-6 shadow-2xl md:bottom-8 md:right-8"
          >
            <h3 className="mb-4 text-lg font-bold">Player Settings</h3>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm text-zinc-400">Theme Color</p>
                <div className="flex gap-2">
                  {PLAYER_COLORS.map((colorOption) => (
                    <button
                      key={colorOption.value}
                      type="button"
                      title={`Set player accent to ${colorOption.label}`}
                      aria-label={`Set player accent to ${colorOption.label}`}
                      onClick={() => setColor(colorOption.value)}
                      className={`h-8 w-8 rounded-full border-2 ${colorOption.swatchClassName} ${
                        color === colorOption.value ? 'border-white' : 'border-transparent'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label htmlFor="autoplay-toggle" className="text-sm text-gray-400">
                  Auto Play
                </label>
                <label htmlFor="autoplay-toggle" className="relative inline-flex cursor-pointer items-center">
                  <input
                    id="autoplay-toggle"
                    type="checkbox"
                    className="peer sr-only"
                    title="Toggle auto play"
                    checked={autoPlay}
                    onChange={(event) => setAutoPlay(event.target.checked)}
                  />
                  <div className="peer h-6 w-11 rounded-full bg-white/10 peer-focus:outline-none peer-checked:bg-netflix-red peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']"></div>
                </label>
              </div>

              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="input-glass mt-4 w-full rounded-lg py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-all hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}