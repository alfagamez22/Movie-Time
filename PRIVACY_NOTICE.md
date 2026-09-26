# PapiFlix Privacy Notice

**Effective date:** 2026-09-27
**Applies to:** papiflix.vercel.app, including PapiFlix, PapiAnime and PapiManga
**Controller:** PapiFlix administrator (harveybuan1234@gmail.com)

This notice explains what viewing data PapiFlix collects, why, how long it is kept and what you can ask us to do with it. It is written to meet the transparency requirements of the Philippine Data Privacy Act of 2012 (RA 10173) and the EU/UK GDPR.

## 1. What we collect

While a title is open in the player, your browser sends a small "heartbeat" to PapiFlix about every 30 seconds. Each heartbeat records:

| Data | Signed-in viewers | Signed-out viewers |
| --- | --- | --- |
| Account email and display name (from Google or email sign-in) | Yes | — |
| Account ID | Yes | — |
| Anonymous visitor ID (random, stored in the `pf_vid` cookie) | Yes | Yes |
| IP address | Yes | Yes |
| Approximate location: country, region and city, from our hosting provider's IP lookup | Yes | Yes |
| Browser and operating system (user agent) | Yes | Yes |
| What you are watching: site, title, poster, season and episode | Yes | Yes |
| When you started, when you were last active, and total watch time | Yes | Yes |

If you are signed in, we also keep your **watch history, playback progress and bookmarks** so you can pick up where you left off on any device.

We do **not** collect passwords in plain text, payment details, or the contents of the third-party video players embedded on the site.

## 2. Why we collect it

- **Running the service:** resuming playback, syncing history and bookmarks across devices.
- **Operations and security:** spotting abuse, unusual traffic or broken titles.
- **Aggregate analytics:** understanding which titles are popular and where viewers are, to improve the catalogue.

Legal basis: our legitimate interest in operating and securing the service (GDPR Art. 6(1)(f); DPA §12(f)), and performance of the service you request when you sign in (Art. 6(1)(b)).

## 3. Who can see it

Only the PapiFlix administrator, through an access-restricted admin dashboard. We do not sell your data or share it with advertisers. It is processed by our infrastructure providers:

- **Vercel:** hosting and IP-based geolocation
- **Couchbase Capella:** database
- **Google:** sign-in, only if you choose Google sign-in

## 4. How long we keep it

- **Viewing-session records** (IP address, location, device, what was watched) **are deleted automatically after 90 days.**
- **Account data, watch history and bookmarks** are kept until you delete them or ask us to delete your account.
- **The `pf_vid` cookie** expires after 12 months.

## 5. Your rights

You can ask to **access, correct, delete or export** your data, or **object** to analytics processing. Email **harveybuan1234@gmail.com** from the address linked to your account; for signed-out viewing, include your approximate viewing time and IP address. We will respond within 30 days. You may also complain to the Philippine National Privacy Commission or to your local data-protection authority.

## 6. Cookies

- **Sign-in session cookies:** required for accounts.
- **`pf_vid`:** a first-party analytics identifier, described above.

We use no third-party advertising cookies.

## 7. Changes

If this notice changes, we will update the effective date above. Material changes will be announced on the site.

---

*Status: document only. The on-site notice (footer link and sign-in disclosure) is planned but not yet implemented.*
