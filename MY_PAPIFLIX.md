# My PapiFlix — local implementation, 2026-10-11

Open `http://localhost:3000/my-papiflix` and sign in. The new tab is available on the desktop header, the account menu, and the mobile/tablet bottom navigation in PapiFlix and PapiAnime. The existing `/bookmarks` route now has compact cinema cards and a My List heading.

## Included

- Corrected “Reveal Vivamax Movies.”
- Navigation highlights the current route/hash, including browser Back and Forward. Same-page links scroll to their section; tablet headers no longer overflow.
- Bookmark options use a native top-layer popover, escaping artwork clipping. All three statuses and Remove remain accessible on phones, with keyboard selection and Escape support.
- Title details use a circular plus/checkmark for My List and a circular Like control immediately to its right. Both show labels on hover or keyboard focus. Trailers are available in the section below the title controls.
- Saved-title cards have consistent landscape artwork, white Play controls, details, status selection, and a compact remove control.
- My PapiFlix combines PapiFlix and PapiAnime in Continue Watching, My List (favorites), liked TV/movies/anime, Trailers Watched, Watch It Again, and Recently Watched. Platform filters are available.
- Continue links retain episode/season/progress. Play again explicitly sets episode/season to 1 and progress to 0. Back from playback can restore the selected title on either library page.
- A separate thumbs-up action adds/removes likes without changing bookmark status. Mounted library views refresh after successful changes and on window focus.
- Trailer history records a YouTube PLAYING event, rather than opening/loading the player. Replaying a watched trailer uses its stored video ID. Player errors offer the original trailer link.
- Save failures retain the previous bookmark/like/history state and display an error. Changing accounts hides the prior account’s data, including when the new library request fails.

## Completion and removal behavior

Movies use reported playback completion (the existing 95% threshold) or a manually selected Completed status. Automatic series completion requires metadata identifying an ended/finished series, its full episode count, and a completed progress record for every episode. Catching up to a currently airing show does not complete the series. Older titles without this metadata, or sources that do not report progress, can be marked Completed from the My List menu.

Removing a recently watched title clears its watch history and saved episode progress using the existing authenticated deletion endpoint and server tombstone mechanism. Favorites and likes are separate and remain available. Continue Watching is the unfinished subset of Recently Watched.

## Persistence and request scope

`/api/my-papiflix` reads only the signed-in user’s records. Ten indexed queries across the two existing media collections run in parallel behind one private, uncached request. The page does not fetch the bookmark collection a second time. History and trailer snapshots are bounded to the most recent 100 records per experience; saved titles and likes remain complete. Existing progress records support completion grouping.

Likes and trailer history use deterministic keys in the existing Couchbase `papiflix` and `papianime` collections. No dependency, physical collection, index change, or data migration was added. Payloads are validated; the session determines ownership and the provider determines the collection. Supplied account IDs cannot select another owner.

## Verification

- All 145 tests pass. Ten new cases cover completion, airing series, provider identity, independent collections, payload validation, authentication, account ownership, trailer keys/URLs, and private query scope.
- TypeScript passes. ESLint passes with the pre-existing manga-reader image warning.
- Production webpack build passes in an isolated temporary copy, leaving the running localhost development server intact. The pre-existing Ably/Keyv build warning remains.
- Isolated signed-in browser fixtures at 1440×1000 and 390×844 passed: collections, platform filtering, resume/restart links, bookmark bounds and Escape, successful/failed status updates, like/unlike for movies and anime, played-only trailer history, and successful/failed history removal. No runtime errors occurred.
- Additional browser checks passed for browser Back highlighting, mobile navigation, tablet/phone overflow, and switching accounts when the new account’s library request fails.
- A real Warner Bros. YouTube trailer loaded and played through the official IFrame API. Its PLAYING event triggered exactly one intercepted history-save request. Account APIs remained mocked in this check.
- Signed-in browser writes and Google login were not performed against the live account/database. These checks establish local UI/API behavior and server ownership validation, not real cross-device persistence.

Screenshots are available in `.playwright-mcp/my-papiflix-desktop.png`, `.playwright-mcp/my-papiflix-mobile.png`, and `.playwright-mcp/bookmark-menu-mobile.png`.

Implementation references: [YouTube IFrame API events](https://developers.google.com/youtube/iframe_api_reference) and [native popover top-layer behavior](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using).
