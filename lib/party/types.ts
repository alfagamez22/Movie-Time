export type WatchParty = {
  code: string;
  createdAt: string;
  endedAt: string | null;
  experience: string;
  hostId: string;
  hostImage: string | null;
  hostName: string;
  mediaId: string;
  mediaProvider: string;
  mediaType: string;
  title: string;
  watchPath: string;
};

/** Published by the host on the `party-sync:<code>` channel. */
export interface PartySyncState {
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
