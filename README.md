# PapiFlix

PapiFlix is a Next.js catalog and player launcher for Vidking that now uses readable, editable slugs instead of a hardcoded page-local library.

## Architecture

```text
app/
   api/media/              HTTP endpoints for catalog and detail lookups
   watch/[slug]/           Canonical slug-based player route
content/
   media/                  Editable movie and TV catalog entries
components/
   media/                  Client-side page shells
lib/
   media/                  Catalog resolution and embed URL helpers
   slugs/                  Slug normalization and alias handling
infrastructure/
   README.md               Deployment and environment notes
```

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add `TMDB_API_TOKEN` or `TMDB_API_KEY` if you want live TMDB metadata lookup for numeric IDs.
3. Start the dev server with `npm run dev`.
4. Validate the project with `npm run validate`.

## Managing the catalog

- Update movies in `content/media/movies.ts`.
- Update series in `content/media/series.ts`.
- Keep canonical slugs in `slug` and preserve old URLs with `aliases`.
- Catalog-backed entries resolve to clean `/watch/<slug>` routes.
- Direct TMDB IDs still work when entered manually from the home page.

## API routes

- `GET /api/media` returns the full catalog.
- `GET /api/media?type=movie` filters by media type.
- `GET /api/media?q=the-boys` searches the slug index.
- `GET /api/media/<slug>` resolves a single entry by slug, alias, or TMDB ID.
- `GET /api/media/<tmdb-id>?type=tv` hydrates live TMDB metadata, including season and episode counts, when credentials are configured.

## Deployment

- Use the root `Dockerfile` for container-based deployment.
- Use `.github/workflows/validate.yml` as the validation gate in CI.
- See `infrastructure/README.md` for environment variables and deployment notes.

## Database

The web app uses Couchbase Capella for user accounts, OAuth accounts, bookmarks, comments, and watch progress. Configure `COUCHBASE_CONNECTION_STRING`, `COUCHBASE_USERNAME`, `COUCHBASE_PASSWORD`, `COUCHBASE_BUCKET`, and `COUCHBASE_SCOPE` in the server environment. The `identity` collection holds shared users, OAuth accounts, sessions, and verification tokens. The `papiflix`, `papianime`, and `mangadex` collections hold each experience's bookmarks, comments, and watch history/progress. `papimanga` records are stored in `mangadex`.

To split a legacy `_default` collection, preview with `npm run db:split:couchbase`, then copy and verify with `npm run db:split:couchbase -- --apply`. The source collection remains intact. For a legacy Postgres import, keep `DATABASE_URL` available only to the migration utilities. Review the dry run with `npm run db:migrate:couchbase`, then copy records with `npm run db:migrate:couchbase -- --apply` and compare source and destination using `npm run db:verify:couchbase`. Set `COUCHBASE_MIGRATION_AUDIT_LOG` to choose the operation log destination; by default, the scripts append to `couchbase-migration-audit.log` in the repository. Named collection indexes are defined in `scripts/couchbase-layout.mjs` and can be provisioned with `npm run db:indexes:couchbase`.

## Google sign-in

- The web app already exposes Google sign-in through Auth.js and the account modal.
- Production needs valid `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `AUTH_SECRET` values on the deployed environment.
- In Google Cloud Console, add the PapiFlix redirect URI as `https://<your-papiflix-domain>/api/auth/callback/google`.
- Do not leave `AUTH_URL` pointed at `localhost` or an old domain in production. If you set it explicitly, it should match the live PapiFlix origin.
