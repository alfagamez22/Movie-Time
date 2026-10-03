import { NextResponse } from 'next/server';
import { activeAnnouncements } from '@/lib/announcements/store';

export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json({ posts: await activeAnnouncements() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ posts: [] }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
