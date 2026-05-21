import type { Metadata } from 'next';

export const metadata: Metadata = {
  description: 'Anime-only discovery and playback inside PapiFlix.',
  title: {
    default: 'PapiAnime',
    template: '%s | PapiAnime',
  },
};

export default function AnimeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
