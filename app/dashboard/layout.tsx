import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { getAdminSession } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: 'Dashboard',
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) notFound();

  return (
    <div className="dashboard-shell min-h-dvh bg-[#050505] text-zinc-100 md:flex">
      <DashboardNav email={session.user?.email ?? ''} />
      <main className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 md:px-10 md:pt-10">{children}</main>
    </div>
  );
}
