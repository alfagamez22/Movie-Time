import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';

import { appConfig } from '@/lib/config';

import './globals.css';

const outfit = Outfit({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: appConfig.name,
    template: `%s | ${appConfig.name}`,
  },
  description: appConfig.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={outfit.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
