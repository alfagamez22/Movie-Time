import { AnnouncementManager } from '@/components/announcements/announcement-manager';
import { getAdminSession } from '@/lib/auth/require-admin';
import { notFound } from 'next/navigation';

export default async function AnnouncementsPage() {
  if (!(await getAdminSession())) notFound();
  return <AnnouncementManager />;
}
