import { appConfig } from '@/lib/config';
import { handleMangaImageRequest } from '@/lib/manga/image-proxy';

export const runtime = 'nodejs';

export function GET(request: Request) {
  return handleMangaImageRequest(request, appConfig.mangadexCdnOrigin);
}
