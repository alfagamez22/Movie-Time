export const PLAYER_PROGRESS_EVENT = 'papi:player-progress';

export interface PlayerProgressDetail {
  duration: number | null;
  seconds: number;
  status: string;
}

export function emitPlayerProgress(seconds: number, status: string, duration?: number | null) {
  window.dispatchEvent(new CustomEvent<PlayerProgressDetail>(PLAYER_PROGRESS_EVENT, {
    detail: { duration: typeof duration === 'number' && duration > 0 ? duration : null, seconds, status },
  }));
}
