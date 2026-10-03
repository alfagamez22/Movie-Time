import { NextResponse } from 'next/server';
import { forbidden, getAdminSession } from '@/lib/auth/require-admin';
import { readAnnouncement, saveAnnouncement } from '@/lib/announcements/store';
import { announcementWrite } from '@/lib/announcements/write';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return forbidden();
  try {
    const post = await readAnnouncement((await params).id);
    if (!post) return NextResponse.json({ error: 'Announcement not found.' }, { status: 404 });
    const { bannerData: _banner, ...fields } = post;
    void _banner;
    return NextResponse.json(fields, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Could not load announcement.' }, { status: 503 }); }
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session?.user?.id) return forbidden();
  const { id } = await params;
  try {
    const existing = await readAnnouncement(id);
    if (!existing) return NextResponse.json({ error: 'Announcement not found.' }, { status: 404 });
    return announcementWrite(request, (input) => saveAnnouncement(input, session.user!.id!, id), { existingPublishAt: existing.publishAt, existingState: existing.state, existingExpiresAt: existing.expiresAt });
  } catch { return NextResponse.json({ error: 'Could not load announcement.' }, { status: 503 }); }
}
