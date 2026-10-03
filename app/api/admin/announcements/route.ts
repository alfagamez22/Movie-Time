import { NextResponse } from 'next/server';
import { forbidden, getAdminSession } from '@/lib/auth/require-admin';
import { listAnnouncements, saveAnnouncement } from '@/lib/announcements/store';
import { announcementWrite } from '@/lib/announcements/write';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!(await getAdminSession())) return forbidden();
  const page = Math.max(1, Math.min(10000, Number.parseInt(new URL(request.url).searchParams.get('page') ?? '1', 10) || 1));
  try { return NextResponse.json(await listAnnouncements(page), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Could not load announcements.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session?.user?.id) return forbidden();
  return announcementWrite(request, (input) => saveAnnouncement(input, session.user!.id!));
}
