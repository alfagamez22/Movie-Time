import { NextResponse } from 'next/server';

import { querySessions } from '@/lib/analytics/store';
import { forbidden, getAdminSession } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await getAdminSession())) return forbidden();
  const params = new URL(request.url).searchParams;
  const signedIn = params.get('signedIn');
  const sessions = await querySessions({
    country: params.get('country') || undefined,
    experience: params.get('experience') || undefined,
    includeAdmin: params.get('includeAdmin') === '1',
    limit: 300,
    search: params.get('search')?.trim().slice(0, 100) || undefined,
    signedIn: signedIn === 'yes' || signedIn === 'no' ? signedIn : undefined,
  });
  return NextResponse.json({ sessions });
}
