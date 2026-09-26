import { NextResponse } from 'next/server';

import { clientIp, rateLimit } from '@/lib/rate-limit';

import { getRequestMeta } from '@/lib/analytics/request-meta';
import { recordHeartbeat } from '@/lib/analytics/store';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/auth/admin';

const VISITOR_COOKIE = 'pf_vid';
const EXPERIENCES = new Set(['papiflix', 'papianime', 'papimanga']);

function text(value: unknown, max = 200): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function readVisitorCookie(request: Request): string | null {
  const match = request.headers.get('cookie')?.match(/(?:^|;\s*)pf_vid=([A-Za-z0-9-]{8,64})/);
  return match?.[1] ?? null;
}

export async function POST(request: Request) {
  const limited = rateLimit('heartbeat', clientIp(request), 20, 60_000);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sessionId = text(body?.sessionId, 64);
  const mediaId = text(body?.mediaId);
  const title = text(body?.title, 300);
  const experience = text(body?.experience, 20);
  if (!body || !sessionId || !/^[A-Za-z0-9-]+$/.test(sessionId) || !mediaId || !title || !experience || !EXPERIENCES.has(experience)) {
    return NextResponse.json({ error: 'Invalid heartbeat' }, { status: 400 });
  }

  const session = await auth();
  const existingVisitor = readVisitorCookie(request);
  const visitorId = existingVisitor ?? crypto.randomUUID();
  const meta = getRequestMeta(request.headers);
  const email = session?.user?.email?.toLowerCase() ?? null;
  const posterUrl = text(body.posterUrl, 500);

  try {
    await recordHeartbeat({
      ...meta,
      email,
      episode: text(body.episode, 10),
      experience,
      isAdmin: isAdminEmail(email),
      mediaId,
      mediaType: text(body.mediaType, 20) ?? 'unknown',
      name: session?.user?.name ?? null,
      posterUrl: posterUrl?.startsWith('http') || posterUrl?.startsWith('/') ? posterUrl : null,
      provider: text(body.provider, 20) ?? 'unknown',
      season: text(body.season, 10),
      sessionId,
      title,
      userId: session?.user?.id ?? null,
      visitorId,
    });
  } catch (error) {
    console.error('Analytics heartbeat failed', { error: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  if (!existingVisitor) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return response;
}
