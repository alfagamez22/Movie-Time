import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    host: SITE_URL,
    rules: [
      {
        allow: '/',
        // APIs, the admin area and per-user pages add nothing to search results.
        disallow: ['/api/', '/dashboard', '/bookmarks', '/*?*party=', '/*?*progress='],
        userAgent: '*',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
