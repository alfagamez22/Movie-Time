# PapiFlix Android

This Android app hosts the existing PapiFlix PWA/mobile UI in a native Android shell. The web app stays the source of truth for layout, routing, playback screens, service worker behavior, and mobile UI polish.

## Configure

Copy `local.properties.example` to `local.properties`, then set `PWA_URL`.

Use `http://10.0.2.2:3000` when testing against `npm run dev` from the Android emulator. Use your deployed HTTPS PapiFlix URL for release builds.

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
