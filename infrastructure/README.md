# Infrastructure Notes

This repository now separates application code from deployability concerns:

- `app/api` exposes the catalog as stable HTTP endpoints.
- `content/media` stores editable movie and TV entries with readable slugs.
- `lib/media` owns catalog resolution and playback embed URL generation.
- `lib/slugs` owns slug normalization and alias handling.
- `.github/workflows/validate.yml` runs the repo validation pipeline.
- `Dockerfile` packages the app using Next.js standalone output for container-based hosts.

## Environment contract

- `NEXT_PUBLIC_APP_NAME`: public app label used in metadata and UI.
- `NEXT_PUBLIC_APP_DESCRIPTION`: public description used in metadata.
- `NEXT_PUBLIC_SITE_URL`: canonical public URL for the deployed app. Set this to the live HTTPS origin so Discord, Facebook, and other social crawlers can fetch `/icons/papiflix-social-preview-v2.jpg` for link previews. On Vercel, local values such as `http://localhost:3000` are ignored in deployed builds when Vercel system URL variables are exposed.
- `VIDFAST_EMBED_BASE_URL`: embed base URL for VidFast, defaults to `https://vidfast.net`.
- `VIDKING_EMBED_BASE_URL`: embed base URL, defaults to Vidking.
- `TMDB_API_TOKEN` or `TMDB_API_KEY`: server-side credentials for live TMDB metadata lookups.

## Deployment options

1. Generic container host: build with the root `Dockerfile` and run the container on any platform that supports Node containers.
2. Vercel or similar Next.js host: deploy directly from the repo and keep the same environment contract.
3. CI-first workflow: use the validation pipeline as the required gate before deployment.

## Catalog maintenance

Add or update entries in `content/media/movies.ts` and `content/media/series.ts`. Slugs are explicit and can be changed safely by keeping old values in `aliases`.

## Search discoverability

Homepage search and social titles/descriptions are defined in `lib/seo.ts` and `app/page.tsx`. The homepage includes visible movie discovery text and links to existing collection and genre pages. Individual watch pages include the title, year when available, and a synopsis in their search description.

After deploying, confirm `NEXT_PUBLIC_SITE_URL` resolves to the public production domain. Use the verified Google Search Console property to submit `/sitemap.xml` and request indexing of the homepage. Monitor impressions, queries and clicks there; indexing and ranking are controlled by search engines and may take time.

Google ignores the keywords meta tag for ranking. Keep wording natural and accurate; do not add repeated keywords, hidden text, unsupported availability claims, or duplicate pages for variants such as “free movies” and “freemovies.” Google also retired its sitelinks search box, so adding `SearchAction` markup does not restore that search result feature.

References: [Google supported meta tags](https://developers.google.com/search/docs/crawling-indexing/special-tags), [title links](https://developers.google.com/search/docs/appearance/title-link), and [sitelinks search box retirement](https://developers.google.com/search/blog/2024/10/sitelinks-search-box).

## Manga image delivery

Fit Width requests 640, 960 or 1440 pixel variants through `/api/manga/proxy`. The existing `sharp` dependency encodes WebP at quality 85 and effort 2, without enlarging images, and retains the original when conversion would increase file size. Files of 32 KiB or less and GIFs bypass conversion. Full Size streams original bytes. Successful responses allow one day of browser/CDN caching; actual edge caching depends on the hosting platform.

The first chapter page loads eagerly with high fetch priority; later pages remain lazy. Native `img` with `srcSet` deliberately uses this proxy because global Next.js optimization is disabled and MangaDex does not supply page dimensions. The local lint exception documents that choice. Requests require an allowed HTTPS host, reject redirects, limit upstream fetch time and bound image input to 12 MiB. Run `node --test tests/manga-image-proxy.test.mjs tests/manga-routes.test.mjs` for the focused regression checks. Browser LCP and real page readability still need measurement against representative chapters after deployment.
