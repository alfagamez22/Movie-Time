# Feedback and user directory

The home-page header across PapiFlix, PapiAnime and PapiManga opens the feedback modal. Guests see the Google sign-in prompt. Feedback requires an authenticated account on the server, regardless of client UI state.

Fields: category (allowlist, Others last), required title (150 characters), optional description (1,000 characters). Client and server normalize whitespace; the server also normalizes Unicode and removes invisible/control characters. Titles must contain a letter or number. Dashboard output is escaped by React and long text wraps.

Storage uses the configured Couchbase bucket and scope, in a separate `feedback` collection. Feedback records contain the submitting user ID, category, title, description, and creation timestamp. The admin list resolves the profile from the identity collection; account deletion therefore removes displayed profile details.

Rate limiting uses an atomic Couchbase counter per user, expiring 24 hours after the first valid attempt. Five valid attempts are allowed within that window. Failed database writes may consume an attempt. Counters expire automatically and are excluded from dashboard queries. Requests must have a same-origin Origin header.

Admin routes `/dashboard/users` and `/dashboard/feedback` use the existing admin authorization and provide search and pagination (50 records per page). The Accounts overview tile links to Users. The user directory lists registered accounts; it does not claim those accounts are currently online.

For a new environment run `node scripts/setup-feedback.mjs` after configuring Couchbase. This creates the collection and its index without modifying existing documents. Run `node scripts/verify-feedback.mjs` to verify query compatibility and concurrent quota behavior. The verification counter is removed after the check.

Validation: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
