import { appConfig } from '@/lib/config';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const urlParam = searchParams.get('url');

  if (!urlParam) {
    return new Response('Missing url.', { status: 400 });
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(urlParam);
  } catch {
    return new Response('Invalid url.', { status: 400 });
  }

  const allowedOrigins = [
    appConfig.mangadexCdnOrigin,
    'https://uploads.mangadex.org',
    'https://api.mangadex.org',
    'https://mangadex.network',
  ];
  const isAllowed = allowedOrigins.some((origin) => {
    try {
      const allowedHost = new URL(origin).hostname;
      return targetUrl.hostname.endsWith(allowedHost);
    } catch {
      return false;
    }
  });

  if (!isAllowed) {
    return new Response('Proxy rejected.', { status: 403 });
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'PapiManga/1.0',
        Referer: 'https://mangadex.org/',
      },
    });

    if (!response.ok) {
      return new Response(`Upstream ${response.status}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';

    return new Response(response.body, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response('Proxy fetch failed.', { status: 502 });
  }
}
