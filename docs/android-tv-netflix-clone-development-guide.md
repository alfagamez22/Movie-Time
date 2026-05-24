# PapiFlix Android TV Netflix Clone Development Guide

This document is a repo-ready blueprint for developing a native Android Studio TV application for the `Movie-Time` / PapiFlix web app. The goal is to create a Netflix-style Android TV client that consumes the existing PapiFlix API, uses local Android build-time configuration for environment values, and keeps sensitive credentials out of Git.

> Compliance note: this guide is for lawful and authorized metadata browsing and media playback only. Use TMDB only for metadata according to its terms, and use playback providers only when you have permission, licensing, or a legitimate provider arrangement. Do not implement DRM bypassing, token extraction, signature bypassing, protected stream scraping, or hidden redistribution of copyrighted content.

## 1. Current Web Repository Context

The current web app is a Next.js PapiFlix project with a catalog and player-launcher structure. The repository README describes these relevant areas:

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

The Android TV app should first treat the deployed Vercel app as the backend API, then only add direct TMDB calls if there is a specific reason. Keeping metadata and provider logic in the Next.js backend is safer than shipping long-lived credentials in an APK.

## 2. Existing API Contract To Consume

The Android TV app should support these PapiFlix web routes:

```http
GET {PAPIFLIX_BASE_URL}/api/media
GET {PAPIFLIX_BASE_URL}/api/media?type=movie
GET {PAPIFLIX_BASE_URL}/api/media?type=tv
GET {PAPIFLIX_BASE_URL}/api/media?q=batman
GET {PAPIFLIX_BASE_URL}/api/media?q=batman&type=movie
GET {PAPIFLIX_BASE_URL}/api/media/{slug}
GET {PAPIFLIX_BASE_URL}/api/media/{tmdb-id}?type=tv
```

Expected browse/search response shape:

```json
{
  "data": [
    {
      "id": "550",
      "provider": "tmdb",
      "type": "movie",
      "title": "Fight Club",
      "synopsis": "...",
      "posterUrl": "https://...",
      "backdropUrl": "https://...",
      "rating": 8.4,
      "voteCount": 30000,
      "year": 1999
    }
  ],
  "filters": { "query": null, "type": null },
  "mode": "browse",
  "source": "live",
  "total": 36
}
```

Expected detail response shape:

```json
{
  "canonicalSlug": "fight-club-550",
  "data": {
    "id": "550",
    "provider": "tmdb",
    "type": "movie",
    "title": "Fight Club",
    "synopsis": "...",
    "posterUrl": "https://...",
    "backdropUrl": "https://...",
    "rating": 8.4,
    "voteCount": 30000,
    "year": 1999
  },
  "matchedBy": "slug",
  "source": "live"
}
```

## 3. User-Provided Android TV Environment Template

Use the following as the local Android TV configuration template. Do not commit the real file with real credentials.

```properties
NEXT_PUBLIC_APP_NAME="PapiFlix"
NEXT_PUBLIC_APP_DESCRIPTION="Stream your Favorite Movies and TV Shows for Free"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
VIDKING_EMBED_BASE_URL="https://www.vidking.net/embed"
ANIWAVE_CDN_ORIGIN="https://megaplay.buzz"
ANITAKU_CDN_ORIGIN="https://anitaku.to"
YOUTUBE_EMBED_BASE_URL="https://www.youtube.com/embed"
YOUTUBE_THUMBNAIL_BASE_URL="https://img.youtube.com/vi"
YOUTUBE_WATCH_BASE_URL="https://www.youtube.com/watch"
TMDB_API_TOKEN="...."
TMDB_API_KEY="...."
```

Recommended Android equivalent:

```properties
# local.properties.example
PAPIFLIX_BASE_URL=https://your-vercel-deployment.vercel.app
NEXT_PUBLIC_APP_NAME=PapiFlix
NEXT_PUBLIC_APP_DESCRIPTION=Stream your Favorite Movies and TV Shows for Free
NEXT_PUBLIC_SITE_URL=https://your-vercel-deployment.vercel.app
VIDKING_EMBED_BASE_URL=https://www.vidking.net/embed
ANIWAVE_CDN_ORIGIN=https://megaplay.buzz
ANITAKU_CDN_ORIGIN=https://anitaku.to
YOUTUBE_EMBED_BASE_URL=https://www.youtube.com/embed
YOUTUBE_THUMBNAIL_BASE_URL=https://img.youtube.com/vi
YOUTUBE_WATCH_BASE_URL=https://www.youtube.com/watch
TMDB_API_TOKEN=
TMDB_API_KEY=
```

Android Studio does not normally read `.env` the same way Next.js does. Use `local.properties`, `secrets.properties`, or `.env.tv.local`, ignore the real file in Git, and inject values into `BuildConfig` during Gradle compilation.

## 4. Recommended Native TV Stack

Use this stack for a maintainable Android TV application:

```text
Language: Kotlin
UI: Jetpack Compose for TV
Navigation: Navigation Compose
Network: Retrofit + OkHttp
JSON: Kotlinx Serialization or Moshi
Images: Coil
Playback: Media3 ExoPlayer for direct authorized HLS/MP4 sources
Embeds: Guarded WebView only for official allowed embed pages
Preferences: DataStore
Local database, optional: Room
Testing: JUnit, MockWebServer, Compose UI tests, Android TV emulator, physical TV remote testing
```

Avoid using a phone-first UI. Android TV requires 10-foot readability, D-pad focus states, large targets, predictable back navigation, and no dependency on touch gestures.

## 5. Target Android Project Structure

```text
PapiFlixTv/
  app/
    build.gradle.kts
    src/main/
      AndroidManifest.xml
      java/com/papiflix/tv/
        MainActivity.kt
        PapiFlixTvApp.kt
        core/
          config/AppConfig.kt
          di/AppContainer.kt
          network/NetworkModule.kt
          result/AppResult.kt
          util/TvFocus.kt
        data/
          remote/PapiFlixApi.kt
          remote/TmdbApi.kt
          dto/MediaDto.kt
          dto/MediaDetailDto.kt
          repository/MediaRepository.kt
          repository/PlaybackRepository.kt
          local/WatchProgressStore.kt
          local/FavoritesStore.kt
        domain/
          model/MediaItem.kt
          model/MediaDetail.kt
          model/PlaybackSource.kt
          model/Rail.kt
          usecase/GetHomeRailsUseCase.kt
          usecase/SearchMediaUseCase.kt
          usecase/GetMediaDetailsUseCase.kt
        ui/
          theme/PapiFlixTheme.kt
          navigation/TvNavGraph.kt
          screens/home/HomeScreen.kt
          screens/details/DetailsScreen.kt
          screens/search/SearchScreen.kt
          screens/player/PlayerScreen.kt
          screens/settings/SettingsScreen.kt
          components/PosterCard.kt
          components/HeroBanner.kt
          components/MediaRail.kt
          components/FocusedButton.kt
          components/LoadingState.kt
          components/ErrorState.kt
        playback/
          ExoPlayerManager.kt
          EmbedWebViewScreen.kt
          PlaybackPolicy.kt
      res/
        drawable/
        mipmap-anydpi-v26/
        values/colors.xml
        values/strings.xml
        values/styles.xml
        xml/network_security_config.xml
  build.gradle.kts
  settings.gradle.kts
  gradle/libs.versions.toml
  local.properties.example
  README-ANDROID-TV.md
```

## 6. Android Manifest Template

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-feature android:name="android.software.leanback" android:required="true" />
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />

    <application
        android:allowBackup="true"
        android:banner="@drawable/tv_banner"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:networkSecurityConfig="@xml/network_security_config"
        android:theme="@style/Theme.PapiFlixTv">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

## 7. Gradle BuildConfig Injection Template

```kotlin
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}

fun envString(name: String, fallback: String = ""): String {
    val value = localProperties.getProperty(name) ?: System.getenv(name) ?: fallback
    return "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
}

android {
    namespace = "com.papiflix.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.papiflix.tv"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "PAPIFLIX_BASE_URL", envString("PAPIFLIX_BASE_URL", "http://10.0.2.2:3000"))
        buildConfigField("String", "APP_NAME", envString("NEXT_PUBLIC_APP_NAME", "PapiFlix"))
        buildConfigField("String", "APP_DESCRIPTION", envString("NEXT_PUBLIC_APP_DESCRIPTION", "Stream your Favorite Movies and TV Shows"))
        buildConfigField("String", "VIDKING_EMBED_BASE_URL", envString("VIDKING_EMBED_BASE_URL", "https://www.vidking.net/embed"))
        buildConfigField("String", "YOUTUBE_EMBED_BASE_URL", envString("YOUTUBE_EMBED_BASE_URL", "https://www.youtube.com/embed"))
        buildConfigField("String", "YOUTUBE_THUMBNAIL_BASE_URL", envString("YOUTUBE_THUMBNAIL_BASE_URL", "https://img.youtube.com/vi"))
        buildConfigField("String", "YOUTUBE_WATCH_BASE_URL", envString("YOUTUBE_WATCH_BASE_URL", "https://www.youtube.com/watch"))
        buildConfigField("String", "TMDB_API_TOKEN", envString("TMDB_API_TOKEN"))
        buildConfigField("String", "TMDB_API_KEY", envString("TMDB_API_KEY"))
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}
```

## 8. Retrofit API Template

```kotlin
interface PapiFlixApi {
    @GET("api/media")
    suspend fun getMedia(
        @Query("type") type: String? = null,
        @Query("q") query: String? = null,
    ): MediaListResponseDto

    @GET("api/media/{slug}")
    suspend fun getMediaDetail(
        @Path("slug") slug: String,
        @Query("type") type: String? = null,
        @Query("id") preferredTmdbId: String? = null,
    ): MediaDetailResponseDto
}
```

## 9. DTO and Domain Model Template

```kotlin
@Serializable
data class MediaListResponseDto(
    val data: List<MediaDto> = emptyList(),
    val filters: MediaFiltersDto? = null,
    val mode: String? = null,
    val source: String? = null,
    val total: Int = 0,
    val totalResults: Int? = null,
    val error: String? = null,
)

@Serializable
data class MediaDetailResponseDto(
    val canonicalSlug: String? = null,
    val data: MediaDto? = null,
    val matchedBy: String? = null,
    val source: String? = null,
    val error: String? = null,
)

data class MediaItem(
    val id: String,
    val slug: String,
    val provider: String,
    val type: MediaType,
    val title: String,
    val synopsis: String,
    val posterUrl: String?,
    val backdropUrl: String?,
    val rating: Double?,
    val voteCount: Int?,
    val year: Int?,
    val maxSeasons: Int? = null,
    val maxEpisodes: Int? = null,
)

enum class MediaType { Movie, Tv }
```

## 10. Core Screens

### Home Screen

The Home screen should contain a top navigation row, a large hero banner, and horizontal rails. Recommended rails:

- Continue Watching
- Trending Now
- Popular Movies
- Popular TV Shows
- Recently Added
- Recommended For You
- Favorites

Each card must have a visible focus ring or scale animation. When the user opens a detail screen and presses Back, restore focus to the last selected card.

### Details Screen

The Details screen should show backdrop, poster, title, year, rating, synopsis, provider/type badge, Play button, Trailer button, Add to Favorites button, and recommendations. TV series should show season and episode controls.

### Search Screen

The Search screen should support D-pad remote input, debounced API calls to `/api/media?q=...`, type filters, loading states, empty states, and recent searches.

### Player Screen

Use Media3 ExoPlayer for authorized direct HLS/MP4 streams. Use guarded WebView only for allowed official embed pages. Never bypass provider restrictions or protected stream controls.

### Settings Screen

Settings should display app name, base URL, cache controls, playback mode, legal notice, and version number.

## 11. Playback Policy

- Direct HLS or MP4 playback must only be used for legal and authorized streams.
- Embed playback must only load official allowed hosts.
- Do not scrape protected streams from embed pages.
- Do not decrypt, intercept, or bypass provider controls.
- Do not bypass DRM, CORS, signatures, or tokens.
- Add a host allowlist for WebView navigation.
- Fail safely with a visible error message when a provider cannot be played on Android TV.

Example guarded WebView client:

```kotlin
class AllowlistedWebViewClient(
    private val allowedHosts: Set<String>,
) : WebViewClient() {
    override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: WebResourceRequest?,
    ): Boolean {
        val host = request?.url?.host ?: return true
        return host !in allowedHosts
    }
}
```

## 12. Implementation Phases

### Phase 0: Repository and API Verification

- Confirm the deployed Vercel URL.
- Confirm `/api/media` returns data on production.
- Confirm `/api/media?type=movie` and `/api/media?type=tv` work.
- Confirm `/api/media?q=<query>` works.
- Confirm `/api/media/<slug>` returns a detail payload.
- Confirm Android emulator can reach local dev through `10.0.2.2:3000`.

### Phase 1: Android Studio TV Bootstrap

- Create a new Android Studio project using Kotlin.
- Add TV launcher manifest support.
- Add the Android TV banner asset.
- Add Compose for TV dependencies.
- Add Gradle BuildConfig injection.
- Add `local.properties.example`.
- Add `.gitignore` entries for secrets.

### Phase 2: Network and Repository Layer

- Implement `PapiFlixApi`.
- Implement `MediaDto` and response DTOs.
- Implement mappers from DTO to domain models.
- Implement `MediaRepository`.
- Add timeout handling.
- Add error wrappers.
- Add test fixtures from real API responses.

### Phase 3: Home UI

- Build hero banner.
- Build poster card.
- Build horizontal rail component.
- Build loading skeleton.
- Build error retry UI.
- Restore focus after returning from details.

### Phase 4: Details UI

- Build metadata header.
- Build action buttons.
- Build season selector for TV.
- Build episode selector for TV.
- Build recommendations rail.
- Implement trailer button using YouTube configuration.

### Phase 5: Search UI

- Build search input.
- Add debounce.
- Add movie/TV filters.
- Render results as a rail/grid.
- Save recent searches locally.

### Phase 6: Playback Layer

- Create `PlaybackSource` domain model.
- Create `PlaybackPolicy` validator.
- Implement Media3 path for direct streams.
- Implement guarded WebView path for embeds.
- Save watch progress where possible.
- Add explicit error states for unsupported provider playback.

### Phase 7: Local State

- Add favorites with DataStore or Room.
- Add continue watching.
- Add recent searches.
- Add settings preferences.
- Add clear cache action.

### Phase 8: Testing

- Unit test DTO mappers.
- Unit test repository error handling.
- Use MockWebServer for API responses.
- UI test focus behavior.
- Manual test with a TV remote.
- Test low-memory Android TV devices.

### Phase 9: Release Preparation

- Add signed release build config.
- Verify no keys exist in Git.
- Verify no real keys appear in APK metadata.
- Add Play Store TV banner and screenshots.
- Add privacy/legal screen.
- Validate Android TV app quality expectations.

## 13. API-to-UI Mapping

| API Field | Android Field | UI Usage | Null Fallback |
|---|---|---|---|
| `id` | `MediaItem.id` | Internal key and playback ID | Do not render if missing |
| `provider` | `MediaItem.provider` | Provider badge and policy routing | Use `unknown` |
| `type` | `MediaItem.type` | Movie/TV badge and route logic | Infer from filter if possible |
| `title` | `MediaItem.title` | Card, hero, details title | `Untitled` |
| `synopsis` | `MediaItem.synopsis` | Hero/details overview | `No synopsis available.` |
| `posterUrl` | `MediaItem.posterUrl` | Poster card image | Placeholder poster |
| `backdropUrl` | `MediaItem.backdropUrl` | Hero/detail background | Gradient or blurred poster |
| `rating` | `MediaItem.rating` | Rating chip | Hide chip |
| `voteCount` | `MediaItem.voteCount` | Optional metadata | Hide chip |
| `year` | `MediaItem.year` | Metadata row | Hide year |
| `maxSeasons` | `MediaItem.maxSeasons` | TV season selector | Hide selector |
| `maxEpisodes` | `MediaItem.maxEpisodes` | TV episode selector | Hide selector |

## 14. Android TV UX Checklist

- Every interactive item must be focusable.
- Focus must be visible on posters, buttons, tabs, filters, and player controls.
- Back button behavior must be predictable.
- Home rails must not lose position after returning from details.
- Text must be readable from a living-room distance.
- Poster cards must not require hover or touch.
- Search must work with a remote.
- Loading states must not look like crashes.
- Error states must include retry where useful.
- Player exit must return to the correct previous screen.

## 15. Security Checklist

- Real `local.properties` must be ignored.
- Real TMDB token and key must not be committed.
- Prefer backend TMDB proxy for production.
- Obfuscation does not make APK secrets safe.
- Use HTTPS for production.
- Avoid cleartext traffic except local dev.
- Use host allowlist for embed WebView navigation.
- Do not allow arbitrary URL loading from API data.
- Do not log credentials.
- Do not expose API tokens in crash reports.

## 16. Testing Checklist

- Test `/api/media` success response.
- Test `/api/media` empty response.
- Test `/api/media` network failure.
- Test `/api/media?q=` search success.
- Test `/api/media/{slug}` detail success.
- Test malformed poster/backdrop URLs.
- Test D-pad navigation across Home.
- Test D-pad navigation across Details.
- Test D-pad navigation across Search.
- Test Back from Player.
- Test resume progress.
- Test favorites persistence.
- Test release build minification.
- Test emulator and physical TV behavior.

## 17. Development Commands

```bash
# Web app validation from Movie-Time root
npm install
cp .env.example .env.local
npm run dev
npm run validate

# Android app commands from Android project root
./gradlew clean
./gradlew assembleDebug
./gradlew testDebugUnitTest
./gradlew connectedDebugAndroidTest
./gradlew assembleRelease
```

## 18. Recommended Follow-Up Repository Files

Add these when the Android app folder is created:

```text
android-tv/local.properties.example
android-tv/README.md
android-tv/app/build.gradle.kts
android-tv/app/src/main/AndroidManifest.xml
docs/android-tv/API_CONTRACT.md
docs/android-tv/ENVIRONMENT_TEMPLATE.md
docs/android-tv/PLAYBACK_POLICY.md
docs/android-tv/TV_UX_CHECKLIST.md
docs/android-tv/TESTING_CHECKLIST.md
```

## 19. Copy-Paste Prompt For Android Studio Or A Coding Agent

```markdown
You are building an Android TV app named PapiFlix TV. Use Kotlin, Jetpack Compose for TV, Retrofit/OkHttp, Coil, DataStore, and Media3. The app consumes a deployed Next.js PapiFlix API from the Movie-Time repository. Implement Netflix-style TV UX with D-pad focus, hero banner, horizontal rails, search, detail screen, TV episode selector, settings, and playback abstraction. Keep all API keys in local.properties or secrets.properties and never commit real credentials. Use PAPIFLIX_BASE_URL for the deployed Vercel base URL. Implement /api/media browse/search and /api/media/{slug} detail calls. Use TMDB fields only as metadata. Playback must use only authorized direct streams or official embeds and must not bypass DRM, signatures, CORS, provider restrictions, or copyright protections. Generate production-quality code with clear package structure, ViewModels, repositories, DTO mapping, loading/error states, and TV accessibility.
```

## 20. Final Recommendation

Start the Android TV client with three working flows only: Home browse, Detail screen, and Search. After these are stable with D-pad focus, add playback. Playback should be isolated behind a `PlaybackPolicy` and `PlaybackRepository` so the app can support multiple lawful provider strategies without rewriting the UI.
