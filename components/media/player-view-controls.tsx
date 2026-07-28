'use client';

import { Maximize2, Minimize2, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useCallback, useEffect, useState, type RefObject } from 'react';

interface PlayerViewControlsProps {
  className: string;
  episodeListVisible?: boolean;
  onToggleEpisodeList?: () => void;
  targetRef: RefObject<HTMLElement | null>;
}

export function PlayerViewControls({
  className,
  episodeListVisible,
  onToggleEpisodeList,
  targetRef,
}: PlayerViewControlsProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(document.fullscreenElement !== null);

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, [targetRef]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }

    void targetRef.current?.requestFullscreen().catch(() => undefined);
  }, [targetRef]);

  return (
    <div className={className}>
      {onToggleEpisodeList ? (
        <button
          type="button"
          onClick={onToggleEpisodeList}
          aria-label={episodeListVisible ? 'Hide episode list' : 'Show episode list'}
          aria-pressed={episodeListVisible}
          title={episodeListVisible ? 'Hide episode list' : 'Show episode list'}
          className="flex h-12 w-12 touch-manipulation select-none items-center justify-center rounded-full bg-black/45 text-zinc-100 backdrop-blur-md transition hover:bg-white/15 hover:text-white hover:ring-1 hover:ring-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-white/20"
        >
          {episodeListVisible ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
        </button>
      ) : null}
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen player'}
        aria-pressed={isFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen player'}
        className="flex h-12 w-12 touch-manipulation select-none items-center justify-center rounded-full bg-black/45 text-zinc-100 backdrop-blur-md transition hover:bg-white/15 hover:text-white hover:ring-1 hover:ring-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-white/20"
      >
        {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
      </button>
    </div>
  );
}
