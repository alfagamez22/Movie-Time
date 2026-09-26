export type WatchParty = {
  backdropUrl: string | null;
  code: string;
  createdAt: string;
  duration: number | null;
  endedAt: string | null;
  episode: string | null;
  experience: string;
  hostId: string;
  hostImage: string | null;
  hostName: string;
  lastActiveAt: string;
  mediaId: string;
  mediaProvider: string;
  mediaType: string;
  posterUrl: string | null;
  season: string | null;
  /** Where the host was in the video when the party started. */
  startTime: number;
  time: number;
  title: string;
  updatedAt: string;
  viewerCount: number;
  watchPath: string;
};

export type PublicParty = Pick<WatchParty,
  'backdropUrl' | 'code' | 'duration' | 'episode' | 'experience' | 'hostImage' | 'hostName' | 'posterUrl' |
  'season' | 'time' | 'title' | 'viewerCount' | 'watchPath'>;

/** Published by the host on the `party-sync:<code>` channel. */
export interface PartySyncState {
  duration: number | null;
  episode: string | null;
  mediaId: string;
  playing: boolean;
  season: string | null;
  sentAt: number;
  time: number;
  watchPath: string;
}

export type PartyPresenceData = {
  image: string | null;
  name: string;
  role: 'host' | 'guest';
};

export const partyRoomName = (code: string) => `party:${code}`;
export const partySyncChannel = (code: string) => `party-sync:${code}`;
