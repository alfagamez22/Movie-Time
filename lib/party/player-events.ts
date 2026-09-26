export const PLAYER_PROGRESS_EVENT = 'papi:player-progress';

export interface PlayerProgressDetail {
  seconds: number;
  status: string;
}

export function emitPlayerProgress(seconds: number, status: string) {
  window.dispatchEvent(new CustomEvent<PlayerProgressDetail>(PLAYER_PROGRESS_EVENT, { detail: { seconds, status } }));
}
