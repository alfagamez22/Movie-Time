import type { Metadata, Viewport } from 'next';
import { SessionProvider } from 'next-auth/react';

import { PwaServiceWorker } from '@/components/media/pwa-service-worker';
import { appConfig } from '@/lib/config';
import { SEO_KEYWORDS } from '@/lib/seo';

import './globals.css';

const socialPreviewImageUrl = new URL(appConfig.socialPreviewImage.path, appConfig.siteUrl).toString();
const socialPreviewImage = {
  alt: appConfig.socialPreviewImage.alt,
  height: appConfig.socialPreviewImage.height,
  secureUrl: socialPreviewImageUrl,
  url: socialPreviewImageUrl,
  width: appConfig.socialPreviewImage.width,
};

// No root canonical: it would be inherited by every page and tell Google they're all duplicates of the home page.
export const metadata: Metadata = {
  applicationName: appConfig.name,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: appConfig.name,
  },
  category: 'entertainment',
  keywords: SEO_KEYWORDS,
  robots: {
    follow: true,
    googleBot: { follow: true, index: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
    index: true,
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION?.trim()
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION.trim() } }
    : {}),
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
        <SessionProvider refetchOnWindowFocus={false}>
          {children}
        </SessionProvider>
        <PwaServiceWorker />
      </body>
    </html>
  );
}
