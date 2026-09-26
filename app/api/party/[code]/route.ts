import { NextResponse } from 'next/server';

import { rateLimit } from '@/lib/rate-limit';

import { auth } from '@/lib/auth';
import { getParty, updateParty } from '@/lib/party/store';
import type { WatchParty } from '@/lib/party/types';

type Params = { params: Promise<{ code: string }> };

function seconds(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function shortText(value: unknown, max: number) {
  return typeof value === 'string' ? value.slice(0, max) : value === null ? null : undefined;
}

export async function GET(_request: Request, { params }: Params) {
  const party = await getParty((await params).code.toUpperCase());
  if (!party) return NextResponse.json({ error: 'Party not found.' }, { status: 404 });
  return NextResponse.json({ party });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  const party = await getParty((await params).code.toUpperCase());
  if (!party) return NextResponse.json({ error: 'Party not found.' }, { status: 404 });
  if (party.hostId !== session?.user?.id) return NextResponse.json({ error: 'Only the host can change the party.' }, { status: 403 });
  const limited = rateLimit('party-update', party.hostId, 12, 60_000);
  if (limited) return limited;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const watchPath = typeof body?.watchPath === 'string' && body.watchPath.startsWith('/') && !body.watchPath.startsWith('//')
    ? body.watchPath.slice(0, 500)
    : undefined;
  const changes: Partial<WatchParty> = {
    lastActiveAt: new Date().toISOString(),
    ...(body?.end ? { endedAt: new Date().toISOString() } : {}),
    ...(watchPath ? { watchPath } : {}),
    ...(typeof body?.title === 'string' ? { title: body.title.slice(0, 300) } : {}),
    ...(seconds(body?.time) !== undefined ? { time: seconds(body?.time) } : {}),
    ...(seconds(body?.duration) !== undefined ? { duration: seconds(body?.duration) } : {}),
    ...(seconds(body?.viewerCount) !== undefined ? { viewerCount: Math.max(1, Math.min(9999, seconds(body?.viewerCount)!)) } : {}),
    ...(shortText(body?.season, 10) !== undefined ? { season: shortText(body?.season, 10) as string | null } : {}),
    ...(shortText(body?.episode, 10) !== undefined ? { episode: shortText(body?.episode, 10) as string | null } : {}),
  };
  const updated = await updateParty(party, changes);
  return NextResponse.json({ party: updated });
}
