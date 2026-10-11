'use client';

export interface YouTubePlayer {
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}
interface YouTubeAPI {
  Player: new (element: HTMLElement, options: {
    host: string; videoId: string; width: string; height: string;
    playerVars: { origin: string; rel: number; playsinline: number };
    events: { onReady(event: { target: YouTubePlayer }): void; onStateChange(event: { data: number }): void; onError(event: { data: number }): void };
  }) => YouTubePlayer;
}
declare global { interface Window { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void } }
let pending: Promise<YouTubeAPI> | null = null;
export function loadYouTubePlayer(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => fail(), 15_000);
    const cleanup = () => { clearTimeout(timeout); window.onYouTubeIframeAPIReady = previous; };
    const fail = () => { cleanup(); script.remove(); pending = null; reject(new Error('Trailer player unavailable.')); };
    window.onYouTubeIframeAPIReady = () => {
      cleanup(); previous?.();
      if (window.YT?.Player) resolve(window.YT); else fail();
    };
    script.src = 'https://www.youtube.com/iframe_api'; script.async = true; script.onerror = fail;
    document.head.appendChild(script);
  });
  return pending;
}
