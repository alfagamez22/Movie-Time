import type { Metadata } from 'next';

export const metadata: Metadata = {
  description: 'Read manga for free on PapiManga.',
  title: {
    default: 'PapiManga',
    template: '%s | PapiManga',
  },
};

export default function MangaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
