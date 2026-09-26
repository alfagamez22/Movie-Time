import * as Ably from 'ably';
import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in to join a watch party.' }, { status: 401 });

  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'Watch party is not configured.' }, { status: 503 });

  const rest = new Ably.Rest({ key });
  const tokenRequest = await rest.auth.createTokenRequest({
    capability: JSON.stringify({ 'party-sync:*': ['subscribe', 'publish', 'history'], 'party:*': ['*'] }),
    clientId: session.user.id,
    ttl: 60 * 60 * 1000,
  });
  return NextResponse.json(tokenRequest);
}
