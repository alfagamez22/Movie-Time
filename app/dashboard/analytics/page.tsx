import type { Metadata } from 'next';

import { LiveAnalytics } from '@/components/dashboard/live-analytics';

export const metadata: Metadata = { title: 'Live Analytics' };

export default function AnalyticsPage() {
  return <LiveAnalytics />;
}
