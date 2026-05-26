package com.example.android

import android.net.Uri
import com.papiflix.app.PapiFlixUrlPolicy
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PapiFlixUrlPolicyTest {
    @Test
    fun keepsSameOriginUrlsInApp() {
        val pwaUrl = "https://papiflix.vercel.app"

        assertTrue(
            PapiFlixUrlPolicy.shouldKeepInApp(
                Uri.parse("https://papiflix.vercel.app/watch/fight-club-550"),
                pwaUrl,
            ),
        )
        assertFalse(
            PapiFlixUrlPolicy.shouldKeepInApp(
                Uri.parse("https://accounts.google.com/o/oauth2/v2/auth"),
                pwaUrl,
            ),
        )
    }

    @Test
    fun acceptsGoogleOAuthCallbackForTheConfiguredPwaOrigin() {
        assertTrue(
            PapiFlixUrlPolicy.shouldLoadIntentUriInApp(
                Uri.parse("https://papiflix.vercel.app/api/auth/callback/google?code=abc"),
                "https://papiflix.vercel.app",
            ),
        )
        assertFalse(
            PapiFlixUrlPolicy.shouldLoadIntentUriInApp(
                Uri.parse("https://evil.example/api/auth/callback/google?code=abc"),
                "https://papiflix.vercel.app",
            ),
        )
    }
}
