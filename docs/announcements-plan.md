# Announcement execution and design

Admin-only authoring; published announcements are visible to signed-in visitors and guests on the PapiFlix, PapiAnime and PapiManga home screens.

## Design
A centered, dismissible announcement card overlays the existing hero. Dark zinc surfaces, restrained red accents, a wide 16:9 banner, strong title, posted date and readable plain-text description match the cinema UI. An X and a Continue browsing button dismiss it; Escape and backdrop dismissal are supported. The same component renders the admin preview and the visitor popup.

## Authoring and lifecycle
The Announcements dashboard lists drafts, scheduled, live, expired and withdrawn posts. Admins create and edit a title, description and optional JPEG/PNG/WebP banner. Draft saves remain private. Publishing requires a start date and expiry later than the start; blank start means publish now. Future starts are scheduled automatically. Withdrawing returns a post to draft. No permanent deletion is needed.

Use Manila time explicitly in datetime controls, store UTC timestamps, and display the posted date as the scheduled publication time rather than the draft creation time. Preview is available before publishing. Uploads are bounded and processed on the server before storing; no external image host or executable HTML is accepted.

## Delivery and storage
A dedicated Couchbase announcements collection stores posts and processed banner data. Visitor queries project only public fields and select published posts with publishAt <= server time < expiresAt. The API is uncached. No cron job is required. Visitors fetch active announcements on entry and periodically while the home page remains open. Expired open cards close automatically. The newest undismissed active post is shown; dismissed IDs are remembered locally per browser, with a bounded history. Management APIs require the existing admin session and same-origin writes.

## Verification
Test schedule/expiry boundaries, title and description limits, missing fields and image validation, and public field projection. Run type checking, lint and production build. Provision the collection/index without publishing sample posts. Verify database queries and logged-out API restrictions.

## Implemented controls and limits

Title: required, 150 characters. Plain-text content: required, 3,000 characters with paragraph breaks. Raster uploads: JPEG/PNG/WebP up to 2 MB, decoded and resized on the server to fit within 1600 × 900; stored output is WebP up to 1 MB. The popup uses keyboard focus containment, Escape, backdrop dismissal and an always accessible X above its scrolling content. Posts retain their records after expiry for admin review.

The public feed delivers at most 20 current posts, newest first. A visit displays one undismissed post; closing it suppresses further popups for that visit. Up to 100 dismissed post IDs are remembered per browser. Editing a dismissed post does not force it to reopen; create a new post to make a new announcement to those visitors. Open home pages refresh availability every 30 seconds and close an expired card on its expiry timer. New visitors always receive a fresh server-filtered feed.

Setup: `node scripts/setup-announcements.mjs`. Verification: `node scripts/verify-announcements.mjs` against the local server on port 3011. Verification records use a private type excluded from visitor/admin feeds, expire after 60 seconds, and are removed at the end. No sample visitor post is published by setup or verification.
