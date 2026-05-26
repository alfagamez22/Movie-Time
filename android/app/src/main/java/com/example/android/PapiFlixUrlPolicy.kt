package com.papiflix.app

import android.net.Uri

object PapiFlixUrlPolicy {
    fun shouldKeepInApp(uri: Uri, pwaUrl: String): Boolean {
        val appUri = Uri.parse(pwaUrl)
        return uri.isHttpUri() &&
            uri.scheme.equals(appUri.scheme, ignoreCase = true) &&
            uri.host == appUri.host &&
            uri.effectivePort() == appUri.effectivePort()
    }

    fun shouldLoadIntentUriInApp(uri: Uri, pwaUrl: String): Boolean =
        shouldKeepInApp(uri, pwaUrl) &&
            uri.encodedPath?.startsWith("/api/auth/callback/", ignoreCase = true) == true

    private fun Uri.isHttpUri(): Boolean =
        scheme.equals("http", ignoreCase = true) || scheme.equals("https", ignoreCase = true)

    private fun Uri.effectivePort(): Int =
        when {
            port != -1 -> port
            scheme.equals("https", ignoreCase = true) -> 443
            scheme.equals("http", ignoreCase = true) -> 80
            else -> -1
        }
}
