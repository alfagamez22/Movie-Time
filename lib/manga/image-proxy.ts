import sharp from 'sharp';

const WIDTHS = new Set([640, 960, 1440]);
const MAX_BYTES = 12 * 1024 * 1024;
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';

export async function handleMangaImageRequest(request: Request, cdnOrigin: string): Promise<Response> {
  const params = new URL(request.url).searchParams;
  let target: URL;
  try {
    target = new URL(params.get('url') ?? '');
  } catch {
    return new Response('Invalid image URL.', { status: 400 });
  }
  const hosts = [new URL(cdnOrigin).hostname, 'uploads.mangadex.org', 'api.mangadex.org', 'mangadex.network'];
  if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443') ||
      !hosts.some((host) => target.hostname === host || target.hostname.endsWith(`.${host}`))) {
    return new Response('Proxy rejected.', { status: 403 });
  }
  const rawWidth = params.get('width');
  const width = rawWidth === null ? null : Number(rawWidth);
  if (width !== null && !WIDTHS.has(width)) return new Response('Invalid image width.', { status: 400 });
  try {
    const upstream = await fetch(target, {
      // Never follow an allowed host's redirect to an unchecked destination.
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { Accept: 'image/webp,image/png,image/jpeg', 'User-Agent': 'PapiManga/1.0', Referer: 'https://mangadex.org/' },
    });
    if (!upstream.ok) return new Response('Image unavailable.', { status: upstream.status });
    const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(contentType)) {
      await upstream.body?.cancel();
      return new Response('Unsupported image.', { status: 415 });
    }
    if (Number(upstream.headers.get('content-length')) > MAX_BYTES) {
      await upstream.body?.cancel();
      return new Response('Image too large.', { status: 413 });
    }
    if (width === null && upstream.body) {
      // Full Size keeps the upstream stream instead of waiting to buffer an entire page.
      let bytes = 0;
      const bounded = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > MAX_BYTES) throw new Error('Image too large.');
          controller.enqueue(chunk);
        },
      }));
      return new Response(bounded, {
        headers: { 'Cache-Control': CACHE_CONTROL, 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' },
      });
    }
    const reader = upstream.body?.getReader();
    if (!reader) return new Response('Empty image.', { status: 502 });
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return new Response('Image too large.', { status: 413 });
      }
      chunks.push(value);
    }
    const original = Buffer.concat(chunks);
    let output: Buffer = original;
    let outputType = contentType;
    // Small files and full-size reading avoid an unnecessary lossy encode.
    if (width && original.length > 32 * 1024 && contentType !== 'image/gif') {
      try {
        const optimized = await sharp(original, { limitInputPixels: 40_000_000 })
          .rotate().resize({ width, withoutEnlargement: true })
          .webp({ quality: 85, effort: 2 }).toBuffer();
        if (optimized.length < original.length) {
          output = optimized;
          outputType = 'image/webp';
        }
      } catch {
        // Keep the original readable if decoding or conversion fails.
      }
    }
    return new Response(new Uint8Array(output), {
      headers: { 'Cache-Control': CACHE_CONTROL, 'Content-Type': outputType, 'Content-Length': String(output.length), 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return new Response('Image fetch failed.', { status: 502 });
  }
}
