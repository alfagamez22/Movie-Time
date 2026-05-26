package com.papiflix.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.ServiceWorkerController
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import java.net.URISyntaxException

class MainActivity : ComponentActivity() {
    private val pwaUrl = normalizedPwaUrl()

    private lateinit var rootView: FrameLayout
    private lateinit var contentHost: FrameLayout
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: View

    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var previousSystemUiVisibility = 0
    private var previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    private var showingOffline = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        configureWindow()
        createLayout()
        configureWebView()
        configureBackNavigation()

        webView.loadUrl(pwaUrl)
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            rootView.removeView(webView)
            webView.stopLoading()
            webView.webChromeClient = null
            webView.webViewClient = WebViewClient()
            webView.destroy()
        }

        super.onDestroy()
    }

    private fun normalizedPwaUrl(): String {
        val candidate = BuildConfig.PWA_URL.trim()
        return candidate.ifEmpty { "http://10.0.2.2:3000" }
    }

    private fun configureWindow() {
        window.statusBarColor = BACKGROUND_COLOR
        window.navigationBarColor = BACKGROUND_COLOR
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.navigationBarDividerColor = BACKGROUND_COLOR
        }
    }

    private fun createLayout() {
        rootView = FrameLayout(this).apply {
            setBackgroundColor(BACKGROUND_COLOR)
        }

        contentHost = FrameLayout(this).apply {
            setBackgroundColor(BACKGROUND_COLOR)
        }
        rootView.addView(
            contentHost,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        applySystemBarInsets()

        webView = WebView(this)
        contentHost.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = ColorStateList.valueOf(ACCENT_COLOR)
            progressBackgroundTintList = ColorStateList.valueOf(Color.TRANSPARENT)
            visibility = View.GONE
        }
        contentHost.addView(
            progressBar,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(3),
                Gravity.TOP,
            ),
        )

        offlineView = createOfflineView().apply {
            visibility = View.GONE
        }
        contentHost.addView(
            offlineView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        setContentView(rootView)
    }

    private fun applySystemBarInsets() {
        contentHost.setOnApplyWindowInsetsListener { _, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val systemBars = insets.getInsets(WindowInsets.Type.systemBars())
                contentHost.setPadding(0, systemBars.top, 0, systemBars.bottom)
            } else {
                @Suppress("DEPRECATION")
                contentHost.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
            }

            insets
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            ServiceWorkerController.getInstance().serviceWorkerWebSettings.apply {
                allowContentAccess = false
                allowFileAccess = false
                blockNetworkLoads = false
                cacheMode = WebSettings.LOAD_DEFAULT
            }
        }

        webView.webViewClient = PapiFlixWebViewClient()
        webView.webChromeClient = PapiFlixChromeClient()
        webView.setDownloadListener { url, _, _, _, _ ->
            openExternal(Uri.parse(url))
        }
    }

    private fun configureBackNavigation() {
        onBackPressedDispatcher.addCallback(this) {
            when {
                fullscreenView != null -> hideFullscreenView()
                webView.canGoBack() -> webView.goBack()
                else -> {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        }
    }

    private fun createOfflineView(): View {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(32), dp(32), dp(32))
            setBackgroundColor(BACKGROUND_COLOR)
        }

        val title = TextView(this).apply {
            setText(R.string.offline_title)
            setTextColor(Color.WHITE)
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }

        val body = TextView(this).apply {
            setText(R.string.offline_body)
            setTextColor(Color.rgb(185, 185, 185))
            textSize = 15f
            gravity = Gravity.CENTER
            setLineSpacing(dp(2).toFloat(), 1f)
        }

        val retry = TextView(this).apply {
            setText(R.string.retry)
            setTextColor(Color.WHITE)
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(12), dp(24), dp(12))
            background = createButtonBackground()
            setOnClickListener {
                setOfflineVisible(false)
                webView.stopLoading()
                webView.loadUrl(pwaUrl)
            }
        }

        layout.addView(title, wrapContentLayoutParams())
        layout.addView(body, spacedLayoutParams(dp(12)))
        layout.addView(retry, spacedLayoutParams(dp(24)))

        return layout
    }

    private fun createButtonBackground(): GradientDrawable =
        GradientDrawable().apply {
            setColor(ACCENT_COLOR)
            cornerRadius = dp(24).toFloat()
        }

    private fun wrapContentLayoutParams(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        )

    private fun spacedLayoutParams(topMargin: Int): LinearLayout.LayoutParams =
        wrapContentLayoutParams().apply {
            this.topMargin = topMargin
        }

    private fun setOfflineVisible(visible: Boolean) {
        showingOffline = visible
        offlineView.visibility = if (visible) View.VISIBLE else View.GONE
        webView.visibility = if (visible) View.GONE else View.VISIBLE
        progressBar.visibility = View.GONE
    }

    private fun showOfflineError(view: WebView) {
        view.stopLoading()
        setOfflineVisible(true)
        if (!view.url.equals(BLANK_PAGE_URL, ignoreCase = true)) {
            view.loadUrl(BLANK_PAGE_URL)
        }
    }

    @Suppress("DEPRECATION")
    private fun showFullscreenView(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (fullscreenView != null) {
            callback.onCustomViewHidden()
            return
        }

        fullscreenView = view
        fullscreenCallback = callback
        previousSystemUiVisibility = window.decorView.systemUiVisibility
        previousOrientation = requestedOrientation

        rootView.addView(
            view,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        contentHost.visibility = View.GONE
        offlineView.visibility = View.GONE
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }

    @Suppress("DEPRECATION")
    private fun hideFullscreenView() {
        val customView = fullscreenView ?: return

        rootView.removeView(customView)
        fullscreenView = null
        contentHost.visibility = View.VISIBLE
        webView.visibility = View.VISIBLE
        requestedOrientation = previousOrientation
        window.decorView.systemUiVisibility = previousSystemUiVisibility

        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
    }

    private fun shouldKeepInApp(uri: Uri): Boolean {
        val appUri = Uri.parse(pwaUrl)
        return uri.isHttpUri() &&
            uri.scheme.equals(appUri.scheme, ignoreCase = true) &&
            uri.host == appUri.host &&
            uri.effectivePort() == appUri.effectivePort()
    }

    private fun Uri.isHttpUri(): Boolean =
        scheme.equals("http", ignoreCase = true) || scheme.equals("https", ignoreCase = true)

    private fun Uri.effectivePort(): Int =
        when {
            port != -1 -> port
            scheme.equals("https", ignoreCase = true) -> 443
            scheme.equals("http", ignoreCase = true) -> 80
            else -> -1
        }

    private fun openExternal(uri: Uri): Boolean {
        return try {
            val intent = if (uri.scheme.equals("intent", ignoreCase = true)) {
                Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
            } else {
                Intent(Intent.ACTION_VIEW, uri)
            }

            startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            openFallbackUrl(uri)
        } catch (_: URISyntaxException) {
            true
        }
    }

    private fun openFallbackUrl(uri: Uri): Boolean {
        if (!uri.scheme.equals("intent", ignoreCase = true)) return true

        return try {
            val intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
            val fallbackUrl = intent.getStringExtra("browser_fallback_url")
            if (!fallbackUrl.isNullOrBlank()) {
                webView.loadUrl(fallbackUrl)
            }
            true
        } catch (_: URISyntaxException) {
            true
        }
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    private inner class PapiFlixWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (!request.isForMainFrame) return false

            if (shouldKeepInApp(uri)) return false

            return openExternal(uri)
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            if (showingOffline && url.equals(BLANK_PAGE_URL, ignoreCase = true)) {
                progressBar.visibility = View.GONE
                return
            }

            setOfflineVisible(false)
            progressBar.visibility = View.VISIBLE
            progressBar.progress = 10
        }

        override fun onPageFinished(view: WebView, url: String) {
            progressBar.visibility = View.GONE
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError,
        ) {
            if (request.isForMainFrame) {
                showOfflineError(view)
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onReceivedError(
            view: WebView,
            errorCode: Int,
            description: String,
            failingUrl: String,
        ) {
            showOfflineError(view)
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            errorResponse: WebResourceResponse,
        ) {
            if (request.isForMainFrame && errorResponse.statusCode >= 500) {
                showOfflineError(view)
            }
        }
    }

    private inner class PapiFlixChromeClient : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            if (showingOffline) {
                progressBar.visibility = View.GONE
                return
            }

            progressBar.progress = newProgress
            progressBar.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
        }

        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            showFullscreenView(view, callback)
        }

        override fun onHideCustomView() {
            hideFullscreenView()
        }

        override fun getDefaultVideoPoster(): Bitmap =
            super.getDefaultVideoPoster() ?: Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
    }

    private companion object {
        val BACKGROUND_COLOR: Int = Color.rgb(5, 5, 5)
        val ACCENT_COLOR: Int = Color.rgb(229, 9, 20)
        const val BLANK_PAGE_URL: String = "about:blank"
    }
}
