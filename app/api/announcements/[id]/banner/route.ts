import { readAnnouncement } from '@/lib/announcements/store';
import { announcementStatus } from '@/lib/announcements/validation';
import { getAdminSession } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const post = await readAnnouncement((await params).id);
    if (!post?.bannerData || (announcementStatus(post) !== 'Live' && !(await getAdminSession()))) return new Response(null, { status: 404 });
    return new Response(Buffer.from(post.bannerData.split(',')[1], 'base64'), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return new Response(null, { status: 503 }); }
}
