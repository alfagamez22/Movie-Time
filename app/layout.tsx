import type { Metadata, Viewport } from 'next';
import { SessionProvider } from 'next-auth/react';

import { PwaServiceWorker } from '@/components/media/pwa-service-worker';
import { appConfig } from '@/lib/config';

import './globals.css';

const socialPreviewImageUrl = new URL(appConfig.socialPreviewImage.path, appConfig.siteUrl).toString();
const socialPreviewImage = {
  alt: appConfig.socialPreviewImage.alt,
  height: appConfig.socialPreviewImage.height,
  secureUrl: socialPreviewImageUrl,
  url: socialPreviewImageUrl,
  width: appConfig.socialPreviewImage.width,
};

export const metadata: Metadata = {
  alternates: {
    canonical: appConfig.siteUrl,
  },
  applicationName: appConfig.name,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: appConfig.name,
  },
  category: 'entertainment',
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
  openGraph: {
    description: appConfig.description,
    images: [
      {
        ...socialPreviewImage,
        type: appConfig.socialPreviewImage.type,
      },
    ],
    locale: 'en_US',
    siteName: appConfig.name,
    title: appConfig.name,
    type: 'website',
    url: appConfig.siteUrl,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  twitter: {
    card: 'summary_large_image',
    description: appConfig.description,
    images: [socialPreviewImage],
    title: appConfig.name,
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
      <body suppressHydrationWarning>
        <SessionProvider>
          {children}
        </SessionProvider>
        <PwaServiceWorker />
      </body>
    </html>
  );
}
