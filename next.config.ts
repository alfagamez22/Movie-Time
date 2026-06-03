import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.0.2.2'],
  reactStrictMode: true,
  outputFileTracingRoot: configDirectory,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // Vercel's hosted image optimizer can fail once quota is exhausted, which
    // breaks posters, trailer thumbnails, and episode stills that work directly.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        port: '',
        pathname: '/t/p/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.anili.st',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 's4.anilist.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.anipixcdn.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.myanimelist.net',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'artworks.thetvdb.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
  async headers() {
    const securityHeaders = [
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      {
        key: 'Permissions-Policy',
        value: [
          'popups=()',
          'notifications=()',
          'microphone=()',
          'camera=()',
          'payment=()',
          'usb=()',
          'serial=()',
          'bluetooth=()',
          'midi=()',
          'accelerometer=()',
          'gyroscope=()',
          'magnetometer=()',
          'encrypted-media=*',
          'autoplay=*',
          'fullscreen=*',
          'picture-in-picture=*',
        ].join(', '),
      },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
