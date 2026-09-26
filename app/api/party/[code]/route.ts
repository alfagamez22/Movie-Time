import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getParty, updateParty } from '@/lib/party/store';

type Params = { params: Promise<{ code: string }> };

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

  const body = await request.json().catch(() => null) as { end?: boolean; title?: string; watchPath?: string } | null;
  const watchPath = typeof body?.watchPath === 'string' && body.watchPath.startsWith('/') && !body.watchPath.startsWith('//')
    ? body.watchPath.slice(0, 500)
    : undefined;
  const updated = await updateParty(party, {
    ...(body?.end ? { endedAt: new Date().toISOString() } : {}),
    ...(watchPath ? { watchPath } : {}),
    ...(typeof body?.title === 'string' ? { title: body.title.slice(0, 300) } : {}),
  });
  return NextResponse.json({ party: updated });
}
