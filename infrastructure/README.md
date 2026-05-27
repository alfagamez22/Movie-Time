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
