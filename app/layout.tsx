import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';

import { PwaServiceWorker } from '@/components/media/pwa-service-worker';
import { appConfig } from '@/lib/config';

import './globals.css';

const outfit = Outfit({ subsets: ['latin'] });

export const metadata: Metadata = {
  applicationName: appConfig.name,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: appConfig.name,
  },
  title: {
    default: appConfig.name,
    template: `%s | ${appConfig.name}`,
  },
  description: appConfig.description,
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: [
      {
        sizes: '180x180',
        url: '/icons/favicon/apple-touch-icon.png',
      },
    ],
    icon: [
      {
        sizes: 'any',
        url: '/icons/favicon/favicon.ico',
      },
      {
        sizes: '32x32',
        type: 'image/png',
        url: '/icons/favicon/favicon-32x32.png',
      },
      {
        sizes: '16x16',
        type: 'image/png',
        url: '/icons/favicon/favicon-16x16.png',
      },
      {
        sizes: '192x192',
        type: 'image/png',
        url: '/icons/favicon/android-chrome-192x192.png',
      },
      {
        sizes: '512x512',
        type: 'image/png',
        url: '/icons/favicon/android-chrome-512x512.png',
      },
    ],
  },
  manifest: '/manifest.webmanifest',
  metadataBase: new URL(appConfig.siteUrl),
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  initialScale: 1,
  themeColor: '#050505',
  viewportFit: 'cover',
  width: 'device-width',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={outfit.className} suppressHydrationWarning>
        {children}
        <PwaServiceWorker />
      </body>
    </html>
  );
}
