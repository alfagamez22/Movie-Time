const PLAYLIST_CONTENT_TYPES = ['application/vnd.apple.mpegurl', 'application/x-mpegurl'];
const RANGE_HEADER = 'range';

const ANIWAVE_CDN_ORIGIN = process.env.ANIWAVE_CDN_ORIGIN?.trim() || 'https://megaplay.buzz';
const ANITAKU_CDN_ORIGIN = process.env.ANITAKU_CDN_ORIGIN?.trim() || 'https://anitaku.to';

type ProxyProfile = 'aniwave-media' | 'anitaku-media' | 'subtitle';

const PROFILE_HEADERS: Record<
  ProxyProfile,
  {
    accept: string;
    origin?: string;
    referer?: string;
  }
> = {
  'anitaku-media': {
    accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,video/*,*/*;q=0.8',
    origin: ANITAKU_CDN_ORIGIN,
    referer: `${ANITAKU_CDN_ORIGIN}/`,
  },
  'aniwave-media': {
    accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,video/*,*/*;q=0.8',
    origin: ANIWAVE_CDN_ORIGIN,
    referer: `${ANIWAVE_CDN_ORIGIN}/`,
  },
  subtitle: {
    accept: 'text/vtt,text/plain,*/*;q=0.8',
    origin: ANIWAVE_CDN_ORIGIN,
    referer: `${ANIWAVE_CDN_ORIGIN}/`,
  },
};

function sanitizeDownloadFilename(rawFilename: string | null): string {
  const fallbackFilename = 'video.mp4';
  if (!rawFilename) {
    return fallbackFilename;
  }

  const trimmedFilename = rawFilename.trim();
  if (!trimmedFilename) {
    return fallbackFilename;
  }

  const safeFilename = trimmedFilename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 180);
  return safeFilename || fallbackFilename;
}

function isPrivateHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  if (normalizedHostname === 'localhost' || normalizedHostname === '127.0.0.1' || normalizedHostname === '::1') {
    return true;
  }

  if (/^10\./.test(normalizedHostname) || /^192\.168\./.test(normalizedHostname)) {
    return true;
  }

  const privateRangeMatch = normalizedHostname.match(/^172\.(\d{1,3})\./);
  if (privateRangeMatch) {
    const secondOctet = Number.parseInt(privateRangeMatch[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
}

function isPlaylistRequest(contentType: string | null, pathname: string): boolean {
  if (contentType) {
    return PLAYLIST_CONTENT_TYPES.some((candidate) => contentType.includes(candidate));
  }

  return pathname.toLowerCase().endsWith('.m3u8');
}

function buildProxyUrl(url: string, profile: ProxyProfile): string {
  const searchParams = new URLSearchParams({
    profile,
    url,
  });

  return `/api/anime/playback/proxy?${searchParams.toString()}`;
}

function rewritePlaylistBody(playlistBody: string, upstreamUrl: URL, profile: ProxyProfile): string {
  return playlistBody
    .split('\n')
    .map((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        return line;
      }

      if (trimmedLine.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
          const absoluteUrl = new URL(uri, upstreamUrl).toString();
          return `URI="${buildProxyUrl(absoluteUrl, profile)}"`;
        });
      }

      return buildProxyUrl(new URL(trimmedLine, upstreamUrl).toString(), profile);
    })
    .join('\n');
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const targetUrlParam = requestUrl.searchParams.get('url');
  const profileParam = requestUrl.searchParams.get('profile');
  const downloadParam = requestUrl.searchParams.get('download');
  const shouldForceDownload = downloadParam === '1' || downloadParam === 'true';
  const requestedFilename = sanitizeDownloadFilename(requestUrl.searchParams.get('filename'));

  if (!targetUrlParam) {
    return new Response('Missing playback url.', { status: 400 });
  }

  if (profileParam !== 'aniwave-media' && profileParam !== 'anitaku-media' && profileParam !== 'subtitle') {
    return new Response('Invalid playback profile.', { status: 400 });
  }

  let targetUrl: URL;

  try {
    targetUrl = new URL(targetUrlParam);
  } catch {
    return new Response('Invalid playback url.', { status: 400 });
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol) || isPrivateHostname(targetUrl.hostname)) {
    return new Response('Playback proxy rejected this target.', { status: 403 });
  }

  const upstreamRequestHeaders = new Headers();
  const rangeHeaderValue = request.headers.get(RANGE_HEADER);
  const profileHeaders = PROFILE_HEADERS[profileParam];

  if (rangeHeaderValue) {
    upstreamRequestHeaders.set(RANGE_HEADER, rangeHeaderValue);
  }

  upstreamRequestHeaders.set(
    'user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  );
  upstreamRequestHeaders.set('accept', profileHeaders.accept);
  upstreamRequestHeaders.set('accept-language', 'en-US,en;q=0.9');

  if (profileHeaders.origin) {
    upstreamRequestHeaders.set('origin', profileHeaders.origin);
  }

  if (profileHeaders.referer) {
    upstreamRequestHeaders.set('referer', profileHeaders.referer);
  }

  const upstreamResponse = await fetch(targetUrl.toString(), {
    cache: 'no-store',
    headers: upstreamRequestHeaders,
    redirect: 'follow',
  });

  const responseHeaders = new Headers();
  const safeHeaders = ['accept-ranges', 'cache-control', 'content-length', 'content-range', 'content-type'];

  safeHeaders.forEach((headerName) => {
    const headerValue = upstreamResponse.headers.get(headerName);
    if (headerValue) {
      responseHeaders.set(headerName, headerValue);
    }
  });

  responseHeaders.set('access-control-allow-origin', '*');

  if (isPlaylistRequest(upstreamResponse.headers.get('content-type'), targetUrl.pathname)) {
    const playlistBody = await upstreamResponse.text();
    const rewrittenBody = rewritePlaylistBody(playlistBody, targetUrl, profileParam);
    responseHeaders.set('content-length', Buffer.byteLength(rewrittenBody).toString());
    responseHeaders.set('content-type', 'application/vnd.apple.mpegurl');

    if (shouldForceDownload) {
      const encodedFilename = encodeURIComponent(requestedFilename);
      responseHeaders.set('content-type', 'application/octet-stream');
      responseHeaders.set(
        'content-disposition',
        `attachment; filename="${requestedFilename}"; filename*=UTF-8''${encodedFilename}`,
      );
    }

    return new Response(rewrittenBody, {
      headers: responseHeaders,
      status: upstreamResponse.status,
    });
  }

  if (shouldForceDownload) {
    const encodedFilename = encodeURIComponent(requestedFilename);
    responseHeaders.set('content-type', 'application/octet-stream');
    responseHeaders.set(
      'content-disposition',
      `attachment; filename="${requestedFilename}"; filename*=UTF-8''${encodedFilename}`,
    );
  }

  return new Response(upstreamResponse.body, {
    headers: responseHeaders,
    status: upstreamResponse.status,
  });
}
