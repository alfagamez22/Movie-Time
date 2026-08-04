# Player embed popup-ad protection

## Current state

All forms of sandboxing have been removed from the player embeds:

- **No `sandbox` attribute** on any player iframe.
- **No restrictive `Permissions-Policy` entries** (`popups=()`, etc.) in
  `next.config.ts` headers — only permissive grants (`encrypted-media=*`,
  `autoplay=*`, `fullscreen=*`, `picture-in-picture=*`) remain.
- **No CSP `sandbox` directive.**

Providers were detecting these restrictions and refusing to play.

## Why popup blocking cannot be done from the front-end

A parent page **cannot** suppress popups that originate inside a cross-origin
iframe:

- **`window.open` override** — the parent can only override `window.open` in
  its *own* JS context. The iframe lives in a different origin and has its own
  `window.open`; the parent cannot reach it (same-origin policy throws).
- **Service Worker** — cannot intercept requests issued from a cross-origin
  iframe (scope + origin restrictions).
- **Shadow DOM / `srcDoc`** — iframe content is rendered in its own document
  context regardless; Shadow DOM on the parent does not encapsulate it. And
  fetching the remote HTML to feed `srcDoc` is CORS-blocked unless the provider
  allows it.
- **Forcing it to work by proxying the HTML onto *this* app origin** — would
  run the provider's untrusted scripts with *our* origin, granting them access
  to auth cookies, `localStorage`, and same-origin `/api` calls. That is an
  XSS / account-takeover hole and must not be done on the main app origin.

## The only working, sandbox-free solution: separate-origin reverse proxy

Popup suppression has to happen on the *content* side, not the parent side.
Implement a dedicated proxy origin (e.g. `player-proxy.papiflix.app`):

1. **Separate origin**, never the main app origin. Cookies/storage for
   `papiflix.app` are not sent to `player-proxy.*`.
2. **Allowlist** of authorized upstream player hosts; reject everything else.
3. **SSRF hardening** — block private/internal IPs, validate redirects, cap
   response size and time.
4. **HTML/URL rewriting** — rewrite relative `src`, `href`, `<script>`,
   `<link>`, media URLs, and navigation targets back through the proxy.
5. **Popup control injection** — before provider scripts execute, intercept
   `window.open`, blank-target anchor clicks, `target=_blank`, form targets,
   and top-navigation attempts; suppress or neutralize ad popups.
6. **Strict CSP + `frame-ancestors`** so the proxied player can only be framed
   by the main app.
7. **No app credentials** on the proxy origin; treat its responses as
   untrusted.

The app then points the player iframe at
`https://player-proxy.papiflix.app/?u=<encoded-upstream-url>` instead of the
bare provider URL.

## To implement the proxy

This change requires infrastructure I cannot create from the app code alone:

- a dedicated hostname/origin, and
- the exact allowed upstream player domains, and
- confirmation that proxying complies with each provider's terms.

Once those are provided, the proxy can be built (as a small Node/edge worker
or a Cloudflare Worker on the dedicated subdomain) and the two player
components updated to route `embedUrl` through it.