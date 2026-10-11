import type { Metadata } from 'next';
import { MyPapiFlixPage } from '@/components/media/my-papiflix-page';
export const metadata: Metadata = { title: 'My PapiFlix', robots: { index: false, follow: false } };
export default function Page() { return <MyPapiFlixPage />; }
