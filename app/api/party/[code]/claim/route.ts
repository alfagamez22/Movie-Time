import { NextResponse } from 'next/server';

import { rateLimit } from '@/lib/rate-limit';

import { auth } from '@/lib/auth';
import { getPartyMembers } from '@/lib/party/ably';
import { getParty, updateParty } from '@/lib/party/store';

/**
 * Hands the host role to the longest-present member once the current host has left.
 * Ably presence is the source of truth, so a guest can't promote themselves while the host is still here.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const limited = rateLimit('party-claim', session.user.id, 10, 60_000);
  if (limited) return limited;

  const party = await getParty((await params).code.toUpperCase());
  if (!party || party.endedAt) return NextResponse.json({ error: 'Party not found.' }, { status: 404 });
  if (party.hostId === session.user.id) return NextResponse.json({ party });

  const members = await getPartyMembers(party.code).catch(() => null);
  if (!members) return NextResponse.json({ error: 'Watch party is not configured.' }, { status: 503 });
  if (members.some((member) => member.clientId === party.hostId)) {
    return NextResponse.json({ error: 'The host is still here.', party }, { status: 409 });
  }
  if (members[0]?.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Another viewer is next in line.', party }, { status: 409 });
  }

  const updated = await updateParty(party, {
    hostId: session.user.id,
    hostImage: session.user.image ?? null,
    hostName: session.user.name ?? session.user.email ?? 'Host',
    lastActiveAt: new Date().toISOString(),
  });
  return NextResponse.json({ party: updated });
}
