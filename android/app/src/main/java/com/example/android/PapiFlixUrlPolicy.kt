package com.papiflix.app

import android.net.Uri
import java.net.URI

object PapiFlixUrlPolicy {
    fun shouldKeepInApp(uri: Uri, pwaUrl: String): Boolean = shouldKeepInApp(uri.toString(), pwaUrl)

    fun shouldKeepInApp(uri: String, pwaUrl: String): Boolean {
        val targetUri = parseUri(uri) ?: return false
        val appUri = parseUri(pwaUrl) ?: return false

        return targetUri.isHttpUri() &&
            targetUri.scheme.equals(appUri.scheme, ignoreCase = true) &&
            targetUri.host == appUri.host &&
            targetUri.effectivePort() == appUri.effectivePort()
    }

    fun shouldLoadIntentUriInApp(uri: Uri, pwaUrl: String): Boolean = shouldLoadIntentUriInApp(uri.toString(), pwaUrl)

    fun shouldLoadIntentUriInApp(uri: String, pwaUrl: String): Boolean {
        val targetUri = parseUri(uri) ?: return false

        return shouldKeepInApp(uri, pwaUrl) &&
            targetUri.rawPath?.startsWith("/api/auth/callback/", ignoreCase = true) == true
    }

    private fun parseUri(uri: String): URI? = runCatching { URI(uri) }.getOrNull()

    private fun URI.isHttpUri(): Boolean =
        scheme.equals("http", ignoreCase = true) || scheme.equals("https", ignoreCase = true)

    private fun URI.effectivePort(): Int =
        when {
            port != -1 -> port
            scheme.equals("https", ignoreCase = true) -> 443
            scheme.equals("http", ignoreCase = true) -> 80
            else -> -1
        }
}
