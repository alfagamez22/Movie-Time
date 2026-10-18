# Browser cache and return visits

PapiFlix uses Cache Storage through its production service worker to reopen previously visited public browse pages without waiting for a document download. Authentication cookies retain their existing purpose; no authentication tokens or account API responses are added to this cache. Browser storage is optional and can be cleared or evicted by the browser.

## Storage policy

| Content | Read behavior | Maximum retained age | Storage bound |
| --- | --- | --- | --- |
| Public browse HTML | Show saved content immediately; refresh in the background on every visit | 24 hours | 12 pages, 8 MiB total, 1 MiB each |
| Same-origin TMDB artwork | Reuse for one day, then show saved artwork while refreshing | 7 days | 120 images, 24 MiB total, 2 MiB each |
| JavaScript, CSS, icons, manifest | Reuse for one day, then refresh in the background | 30 days | 160 entries, 24 MiB total, 4 MiB each |

The worker caches only successful, cacheable responses. It respects `private`, `no-store`, `no-cache`, cookie-dependent responses, redirects and non-HTML responses. Next.js RSC, prefetch payloads and query variants bypass the document cache. Private APIs, account pages, admin pages, player pages, chapter pages and playback URLs are excluded. Cache writes are bounded and failures fall back to network delivery. Activation removes only old PapiFlix cache names.

## Freshness and visible content

A content revision identifies each saved public document. When the background fetch detects a different revision, the active browse page refreshes its server content without a full reload. A restored page sends its rendered revision after hydration so it can catch updates that arrived before its listeners were ready. Hidden tabs defer visible updates until they return. Rapid updates are coalesced with a trailing refresh, and checking on focus/reconnect is limited to once per 30 seconds.

This revalidates against the application's server cache. Existing movie/anime revalidation windows still apply; PapiManga's public browse page now revalidates every 15 minutes, matching its existing browse data cache. Browser caching does not bypass an upstream provider's caching or make new releases appear before the server discovers them.

Public browse content can render while authentication resolves. The account menu retains its session placeholder, and homepage history waits for session/history checks instead of blocking the entire catalog. Private routes keep the session gate. Account writes continue to require server authorization, and private responses remain `private, no-store`. Personal data is not duplicated into the shared service worker cache.

## Availability and verification

Service workers require HTTPS (or localhost) and supported browser storage. The worker is disabled in development. First visits, evicted caches, expired entries and uncached pages still need the network. Previously visited public pages can reopen offline within the age limit, but streaming, login and account updates still need connectivity.

Run `node --test tests/browser-cache.test.mjs` for expiration, background updates, privacy exclusions, byte/count limits, blocked storage, revision recovery, deferred refreshes and session gating. The full configured suite passed 171 tests, and TypeScript, ESLint and an isolated production webpack build passed. The existing Ably/Keyv build warning remains.

Real Chromium tests at 1440x900, 768x1024 and 390x844 use an isolated local fixture serving the actual worker. With a simulated 700 ms document response, cold DOM readiness was 713–716 ms and cached reopening was 8–13 ms. All three sizes received revision updates, reopened the updated snapshot offline and refused to serve private pages offline. The isolated production app also reopened cached HTML without hydration errors at desktop and phone sizes, with session/announcement responses mocked. Public content appeared while the session response was still pending. No live account writes were performed.

Fixture timings are mechanism checks, not production LCP benchmarks or proof on physical iOS/Android devices. Real content availability, platform cache quotas and deployed server freshness still apply.
