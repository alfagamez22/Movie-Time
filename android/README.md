# PapiFlix Android

This Android app hosts the existing PapiFlix PWA/mobile UI in a native Android shell. The web app stays the source of truth for layout, routing, playback screens, service worker behavior, and mobile UI polish.

## Configure

Copy `local.properties.example` to `local.properties`, then set `PWA_URL`.

Use `http://10.0.2.2:3000` when testing against `npm run dev` from the Android emulator. Use your deployed HTTPS PapiFlix URL for release builds.

## Environment

The Android client only needs the public PWA URL. It does not require, and must never receive, any of the following:

- `TMDB_API_TOKEN` / `TMDB_API_KEY`
- `AUTH_SECRET` / `AUTH_GOOGLE_SECRET`
- `DATABASE_URL`
- `NEXT_PUBLIC_SITE_URL` for production

The PWA backend (Next.js on Netlify/Vercel) keeps all real secrets in its environment variables. Android only needs to know where the deployed PWA is hosted so the WebView can load it.

`local.properties` is the only place to override `PWA_URL` locally. It is ignored by git and must stay untracked.

| Setting            | Where             | Purpose                                            |
|--------------------|-------------------|----------------------------------------------------|
| `PWA_URL`          | `local.properties` (ignored) | Overrides the deployed PWA origin used by the WebView. |
| `PAPIFLIX_BASE_URL`| `local.properties` (ignored) | Fallback when `PWA_URL` is not set.               |
| `sdk.dir`          | `local.properties` (ignored) | Android Studio/Gradle local SDK path.            |

The committed `local.properties.example` documents the keys; never commit the real file. Production builds are still controlled by whatever the developer passes through Gradle or CI for the release configuration.

## Run

Open `android/` in Android Studio, sync Gradle, then run the `app` configuration on an emulator or device.

From PowerShell, this also builds a debug APK:

```powershell
.\gradlew.bat :app:assembleDebug
```

The app supports WebView storage, service workers, Android back navigation, external-link handoff, fullscreen video, and an offline retry screen.

## Google sign-in callback

The Android shell registers an app link for:

```text
<PWA_URL>/api/auth/callback/google
```

This lets a browser-based Google OAuth flow return to the WebView when `PWA_URL` points at the deployed HTTPS app. The Android shell does not include the native Google Sign-In SDK; it relies on the PapiFlix web OAuth flow and only handles the callback handoff back into the app.

To make Android open the app automatically instead of showing a chooser, publish a matching `assetlinks.json` for `com.papiflix.app` on the deployed domain.
