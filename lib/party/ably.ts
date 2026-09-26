import * as Ably from 'ably';

import { partyRoomName } from './types';

export function getAblyRest() {
  const key = process.env.ABLY_API_KEY?.trim();
  return key ? new Ably.Rest({ key }) : null;
}

/** Present members of a party's chat room, oldest join first. Ably Chat rooms live on `<room>::$chat`. */
export async function getPartyMembers(code: string) {
  const rest = getAblyRest();
  if (!rest) return null;
  const page = await rest.channels.get(`${partyRoomName(code)}::$chat`).presence.get();
  const byClient = new Map<string, number>();
  for (const member of page.items) {
    if (!member.clientId) continue;
    const at = member.timestamp ?? Date.now();
    byClient.set(member.clientId, Math.min(byClient.get(member.clientId) ?? Infinity, at));
  }
  return [...byClient.entries()]
    .map(([clientId, joinedAt]) => ({ clientId, joinedAt }))
    .sort((a, b) => a.joinedAt - b.joinedAt || a.clientId.localeCompare(b.clientId));
}
