import { NextResponse } from 'next/server';

import { getLiveSessions } from '@/lib/analytics/store';
import { forbidden, getAdminSession } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await getAdminSession())) return forbidden();
  const includeAdmin = new URL(request.url).searchParams.get('includeAdmin') === '1';
  const sessions = await getLiveSessions(includeAdmin);
  return NextResponse.json({ generatedAt: new Date().toISOString(), sessions });
}
