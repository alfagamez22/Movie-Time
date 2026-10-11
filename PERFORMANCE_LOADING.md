# Session and loading evaluation — 2026-10-11

Implemented locally. The startup screen uses the existing `/icons/papiflixbanner.png` asset and a red spinner. It disappears when the session has resolved and, on signed-in homepages, the visible experience's history has refreshed. Requests and errors drive the animation; there is no minimum splash duration. Off-screen posters, public announcements, and other experiences' uploads continue independently.

## Findings and changes

| Finding | Change |
| --- | --- |
| Session refresh on tab return was disabled. | Enabled Auth.js visibility refresh. Pending session state gates interaction and displays the branded screen; slow requests offer Retry. |
| All three experiences' first-login uploads preceded visible history. | Sync the visible experience first and upload other experiences afterward. Local progress survives failed uploads and reads. |
| History and episode progress used separate HTTP requests and authentication checks. | Added optional `includeProgress=1` to the authenticated history API. It runs both database queries in parallel and returns private, uncached data. Existing callers remain compatible. |
| Every record lookup used SQL++, even when its document key was known. | Added routed KV reads for deterministic account/bookmark/history/progress keys, with the original indexed query fallback for migrated IDs. Tombstones use the known experience's collection. |
| Repeated record and public-announcement queries were ad hoc. | Reuse prepared plans while retaining `request_plus` consistency for fresh indexed reads. |
| History uploads could start every record write at once. | Limit each sync to 24 entries and six concurrent upserts. Independent history/progress writes run in parallel. |
| Genre lookup fetched artwork candidates for every category. | Genre title APIs now fetch only genre definitions and the requested title page. Category artwork loading remains on the category tile path. |
| Search debounce was treated as request completion. | Keep the searching indicator until both title and people requests settle; cancel obsolete requests and distinguish service failure from no matches. |
| Pagination lacked a visible failure/retry path and could retain obsolete network requests. | Add poster placeholders, a loading indicator, cancellation, request guards, and Retry. Retain loaded titles on failure. |
| Search failures returned HTTP 200 and could receive public cache headers. | Cache successful TMDB/anime results only. Genre failures return 503 with `no-store`. |

Cookies are attached by the browser to same-origin requests before session validation. Authentication uses JWT sessions, so anonymous session resolution does not require a Couchbase query. The client never reads the authentication cookie. The shared Couchbase connection already existed and remains reused.

## Measurements

These are individual local observations, not a controlled before/after benchmark or a production service guarantee.

| Check | Result |
| --- | --- |
| Warm development homepage before edits | HTML TTFB 156 ms; DOM ready 263 ms |
| Anonymous development session before edits | 14–26 ms |
| Warm development homepage after edits | HTML TTFB 181 ms; session requests 4–7 ms |
| Isolated production build, real anonymous browser visit | HTML TTFB 46 ms; DOM ready 165 ms; signed-out UI ready in 538 ms including hydration/session resolution |
| Fresh Couchbase connection with the app's WAN profile | 250 ms |
| Indexed history query for a nonexistent probe user | First ad-hoc query 194 ms; prepared queries 54 ms then 49 ms |
| First routed KV miss in that connection | 103 ms |

The first query also includes connection/service warmup, so these timings do not establish a percentage speedup from prepared plans. The main confirmed improvements are reduced request counts, less query planning, direct reads for existing deterministic records, and fewer dependencies on the startup path.

Read-only database inspection confirmed all 22 relevant identity/media/announcement indexes were online. No indexes or stored records were changed by this evaluation.

## Verification

- TypeScript passes. ESLint passes with one existing manga-reader `<img>` warning.
- All 135 tests pass, including ten new regression cases covering KV routing, migrated IDs, filter validation, genre request scope, authentication, private responses, bounded upload concurrency, and uncached API errors.
- Production webpack build passes in a temporary project copy, preserving the running development server. Homepage remains static with one-hour revalidation and anime remains static with 30-minute revalidation. Build emits an Ably/Keyv dependency warning.
- Real anonymous session and public announcements were exercised locally. Signed-in browser scenarios used isolated mocked session/history responses to avoid writing test account data to Couchbase; they do not establish real Google sign-in or cross-device persistence.
- Delayed session: one visible loading screen, underlying controls inert, then normal signed-out UI. Mobile at 390×844 has no horizontal overflow; reduced-motion preference disables spinner animation.
- Signed-in fixture: visible history upload → one combined history request → other-experience upload. Account controls remain hidden until history is ready.
- Failed history fixture: loading ends, local history stays visible, and Retry recovers.
- Delayed search fixture: no premature “No results” state.
- Pagination fixture: one next-page request, existing titles retained after an error, Retry succeeds.
- Isolated production focus fixture: session account information updates after a visibility event.
- Mobile and desktop loading screenshots are in `.playwright-mcp/performance-loading-mobile.png` and `.playwright-mcp/performance-loading-desktop.png`.

## References

[Auth.js SessionProvider behavior](https://authjs.dev/reference/nextjs/react) and [Couchbase prepared-query guidance](https://docs.couchbase.com/nodejs-sdk/current/concept-docs/n1ql-query.html).
