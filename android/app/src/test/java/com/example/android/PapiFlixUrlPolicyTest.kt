package com.example.android

import com.papiflix.app.PapiFlixUrlPolicy
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PapiFlixUrlPolicyTest {
    @Test
    fun keepsSameOriginUrlsInApp() {
        val pwaUrl = "https://app.example.test"

        assertTrue(
            PapiFlixUrlPolicy.shouldKeepInApp(
                "https://app.example.test/watch/fight-club-550",
                pwaUrl,
            ),
        )
        assertFalse(
            PapiFlixUrlPolicy.shouldKeepInApp(
                "https://accounts.google.com/o/oauth2/v2/auth",
                pwaUrl,
            ),
        )
    }

    @Test
    fun acceptsGoogleOAuthCallbackForTheConfiguredPwaOrigin() {
        assertTrue(
            PapiFlixUrlPolicy.shouldLoadIntentUriInApp(
                "https://app.example.test/api/auth/callback/google?code=abc",
                "https://app.example.test",
            ),
        )
        assertFalse(
            PapiFlixUrlPolicy.shouldLoadIntentUriInApp(
                "https://evil.example/api/auth/callback/google?code=abc",
                "https://app.example.test",
            ),
        )
    }
}
