import type { MetadataRoute } from 'next';

import { appConfig } from '@/lib/config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: '#050505',
    categories: ['entertainment', 'video'],
    description: appConfig.description,
    display: 'standalone',
    icons: [
      {
        sizes: '192x192',
        src: '/icons/favicon/android-chrome-192x192.png',
        type: 'image/png',
      },
      {
        purpose: 'maskable',
        sizes: '512x512',
        src: '/icons/favicon/android-chrome-512x512.png',
        type: 'image/png',
      },
    ],
    id: '/',
    name: appConfig.name,
    orientation: 'any',
    scope: '/',
    short_name: appConfig.name,
    start_url: '/',
    theme_color: '#050505',
  };
}
