import { NextResponse } from 'next/server';

import { hit } from './rate-limit-core';

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/** Returns a 429 response when over the limit, otherwise null. */
export function rateLimit(scope: string, identity: string, limit: number, windowMs: number): NextResponse | null {
  const result = hit(`${scope}:${identity}`, limit, windowMs);
  if (!result.limited) return null;
  return NextResponse.json(
    { error: 'Too many requests. Please slow down.' },
    { headers: { 'Retry-After': String(result.retryAfterSeconds) }, status: 429 },
  );
}
