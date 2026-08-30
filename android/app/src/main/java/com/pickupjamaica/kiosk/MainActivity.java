package com.pickupjamaica.kiosk;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import com.getcapacitor.BridgeActivity;

/**
 * Kiosk MainActivity — Full-screen WebView wrapper for Pickup Jamaica locker system.
 *
 * Critical features:
 * - Immersive sticky mode (Android 5+ legacy + Android 11+ WindowInsetsController)
 * - Network error handling with branded offline page
 * - Auto-reload when connectivity is restored
 * - Screen always on (WAKE_LOCK) for 24/7 kiosk operation
 * - Screenshot prevention (FLAG_SECURE) for payment security
 * - Landscape orientation lock (set in manifest)
 * - WebView debugging disabled in release builds
 * - Auto-restart on boot (via BootReceiver)
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "PickupKiosk";
    private static final String KIOSK_URL = "https://pickuplocker.vercel.app/kiosk-lite";
    private static final String KIOSK_HOST = "pickuplocker.vercel.app";
    private static final String OFFLINE_URL = "file:///android_asset/offline.html";

    // Reconnect timing — exponential backoff, capped at 60s, retries forever
    // (kiosk should never give up)
    private static final int RECONNECT_DELAY_INITIAL_MS = 5000;   // 5 seconds
    private static final int RECONNECT_DELAY_MAX_MS = 60000;      // 60 seconds (cap)
    private static final int CONNECTIVITY_CHECK_MS = 3000;        // 3 seconds after network callback
    private static final int DNS_RESOLVE_TIMEOUT_MS = 5000;       // 5 seconds for DNS pre-flight

    private WebView webView;
    private Handler mainHandler = new Handler(Looper.getMainLooper());
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean isShowingOfflinePage = false;
    private int reconnectAttempts = 0;  // Used for exponential backoff (no cap — retries forever)

    // Flag: the WebView is currently showing something other than KIOSK_URL or OFFLINE_URL
    // (e.g. Chrome's ERR_NAME_NOT_RESOLVED error page, about:blank, etc.).
    // When true, any NetworkCallback recovery should trigger a reload.
    private boolean isShowingErrorPage = false;

    // In-app self-update checker — polls /api/app-version periodically
    // and installs new APKs via the system PackageInstaller.
    private UpdateChecker updateChecker;
    private static final String UPDATE_BASE_URL = "https://pickuplocker.vercel.app";

    // WebView health monitoring — detects frozen/white screens at the native level
    private static final int HEALTH_CHECK_INTERVAL_MS = 60000;   // 1 minute
    private static final int HEALTH_RELOAD_THRESHOLD = 2;        // After 2 failed checks, force reload (2 min total)
    private int healthCheckFailCount = 0;
    private Runnable healthCheckRunnable;

    // Secret exit mechanism: tap top-left corner 5 times within 3 seconds
    private static final int SECRET_TAP_COUNT = 5;
    private static final int SECRET_TAP_TIMEOUT_MS = 3000;  // 3 seconds
    private static final int SECRET_TAP_AREA_DP = 80;       // 80dp x 80dp hit area
    private int secretTapCount = 0;
    private long lastSecretTapTime = 0;

    // Admin PIN for kiosk exit (change this to your desired PIN)
    // In production, this should be fetched from server or stored encrypted
    private static final String ADMIN_EXIT_PIN = "1234";


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen on for kiosk mode (24/7 operation)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Prevent screenshots and screen recording (payment security)
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // Fullscreen — hide status bar and navigation bar
        hideSystemUI();

        // Configure WebView
        configureWebView();

        // Register network connectivity monitoring
        registerConnectivityMonitoring();

        // Start WebView health monitoring
        startHealthMonitoring();

        // Start in-app self-update checker
        updateChecker = new UpdateChecker(this, UPDATE_BASE_URL, new UpdateChecker.Callback() {
            @Override
            public void onUpdateAvailable(String newVersion, String changelog, boolean forceUpdate) {
                Log.i(TAG, "Update available: v" + newVersion + " (forceUpdate=" + forceUpdate + ")");
                if (forceUpdate) {
                    Log.w(TAG, "Force update requested — UI should be blocked until install completes");
                    // TODO: show a full-screen "Updating..." overlay that blocks interaction.
                    // For now, we just log. The system PackageInstaller dialog will appear
                    // on top regardless.
                }
            }

            @Override
            public void onUpdateInstallStarted(String apkPath) {
                Log.i(TAG, "Update install started: " + apkPath);
            }

            @Override
            public void onUpdateToDate() {
                Log.i(TAG, "App is up to date");
            }

            @Override
            public void onUpdateError(String message) {
                Log.w(TAG, "Update check error: " + message);
            }
        });
        updateChecker.start();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-apply immersive mode when returning to the activity
        hideSystemUI();

        // If we were showing the offline page, check if network is back
        if (isShowingOfflinePage) {
            checkAndReload();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        // Clean up network callback
        unregisterConnectivityMonitoring();
        // Stop health monitoring
        stopHealthMonitoring();
        // Stop update checker
        if (updateChecker != null) {
            updateChecker.stop();
        }
        // Remove any pending reconnect runnables
        mainHandler.removeCallbacksAndMessages(null);
    }

    // ============================================
    // IMMERSIVE MODE — Works on Android 5.0 through 15+
    // ============================================

    private void hideSystemUI() {
        // Modern API (Android 11 / API 30+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);

            getWindow().getInsetsController().hide(
                android.view.WindowInsets.Type.statusBars()
                | android.view.WindowInsets.Type.navigationBars()
            );

            // BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE replaces the deprecated
            // SYSTEM_UI_FLAG_IMMERSIVE_STICKY. Bars appear briefly on swipe
            // then auto-hide after a few seconds — perfect for kiosk.
            getWindow().getInsetsController().setSystemBarsBehavior(
                android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        } else {
            // Legacy API (Android 5.0 – 10)
            View decorView = getWindow().getDecorView();
            int uiOptions = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN;
            decorView.setSystemUiVisibility(uiOptions);
        }
    }

    // ============================================
    // WEBVIEW CONFIGURATION
    // ============================================

    private void configureWebView() {
        webView = getBridge().getWebView();
        if (webView == null) {
            Log.e(TAG, "Capacitor WebView is null — cannot configure");
            return;
        }

        WebSettings settings = webView.getSettings();

        // Core settings
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);          // For offline.html
        settings.setAllowContentAccess(true);

        // Mixed content (HTTP from HTTPS page)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Cache: network first, cache as fallback
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Zoom: disabled for kiosk
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // Disable WebView debugging in release builds
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            // Only enable debugging for debuggable (non-release) builds
            android.content.pm.ApplicationInfo appInfo = getApplicationInfo();
            if (appInfo != null
                && (appInfo.flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                WebView.setWebContentsDebuggingEnabled(true);
            }
            // Release builds default to false, but be explicit
        }

        // Custom WebViewClient for error handling and navigation control
        webView.setWebViewClient(new KioskWebViewClient());

        // Custom WebChromeClient for console logging + Chrome error page detection
        webView.setWebChromeClient(new KioskWebChromeClient());

        // Pre-flight DNS check before the first loadUrl.
        // If DNS fails, show the branded offline page immediately instead of
        // letting Chrome render its ERR_NAME_NOT_RESOLVED page (which the
        // WebViewClient.onReceivedError callback doesn't always fire for).
        loadKioskUrlWithDnsCheck();
    }

    // ============================================
    // DNS PRE-FLIGHT CHECK
    // ============================================

    /**
     * Resolves KIOSK_HOST on a background thread. If resolution succeeds,
     * loads KIOSK_URL on the main thread. If it fails (or times out),
     * shows the branded offline page immediately and schedules a retry.
     *
     * This prevents the WebView from rendering Chrome's raw error page
     * when DNS is broken — a state the existing onReceivedError handler
     * does not reliably catch.
     */
    private void loadKioskUrlWithDnsCheck() {
        Thread dnsThread = new Thread(() -> {
            final java.util.concurrent.atomic.AtomicBoolean resolved = new java.util.concurrent.atomic.AtomicBoolean(false);
            try {
                // Resolve with a timeout. java.net.InetAddress doesn't natively
                // support per-call timeouts, so we race it against a watchdog.
                final java.util.concurrent.atomic.AtomicBoolean done = new java.util.concurrent.atomic.AtomicBoolean(false);
                Thread resolver = new Thread(() -> {
                    try {
                        java.net.InetAddress[] addrs = java.net.InetAddress.getAllByName(KIOSK_HOST);
                        if (addrs.length > 0) {
                            resolved.set(true);
                        }
                    } catch (java.net.UnknownHostException e) {
                        Log.w(TAG, "DNS pre-flight: cannot resolve " + KIOSK_HOST + " — " + e.getMessage());
                    } catch (Exception e) {
                        Log.w(TAG, "DNS pre-flight: unexpected error — " + e.getMessage());
                    } finally {
                        done.set(true);
                    }
                });
                resolver.setDaemon(true);
                resolver.start();
                resolver.join(DNS_RESOLVE_TIMEOUT_MS);
                if (!done.get()) {
                    resolver.interrupt();
                    Log.w(TAG, "DNS pre-flight: timed out after " + DNS_RESOLVE_TIMEOUT_MS + "ms");
                }
            } catch (Exception e) {
                Log.w(TAG, "DNS pre-flight: exception — " + e.getMessage());
            }

            final boolean finalResolved = resolved.get();
            mainHandler.post(() -> {
                if (finalResolved) {
                    Log.i(TAG, "DNS pre-flight OK — loading " + KIOSK_URL);
                    if (webView != null) {
                        isShowingErrorPage = false;
                        webView.loadUrl(KIOSK_URL);
                    }
                } else {
                    Log.w(TAG, "DNS pre-flight FAILED — showing offline page");
                    showOfflinePage();
                }
            });
        });
        dnsThread.setDaemon(true);
        dnsThread.start();
    }

    // ============================================
    // WEBVIEW CLIENT — Error Handling & Navigation
    // ============================================

    private class KioskWebViewClient extends WebViewClient {

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);

            if (OFFLINE_URL.equals(url)) {
                isShowingOfflinePage = true;
                Log.w(TAG, "Showing offline page — server unreachable");
            } else if (KIOSK_URL.equals(url) || url.startsWith("https://pickuplocker.vercel.app")) {
                isShowingOfflinePage = false;
                isShowingErrorPage = false;
                reconnectAttempts = 0;
                healthCheckFailCount = 0; // Reset health on successful page load
                Log.i(TAG, "Page loaded successfully: " + url);
            } else {
                // Some other URL — likely Chrome's error page or about:blank
                isShowingErrorPage = true;
                Log.w(TAG, "Page loaded non-kiosk URL (likely error page): " + url);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            // Only handle main frame errors (not subresources like images/CSS)
            if (request.isForMainFrame()) {
                Log.e(TAG, "Main frame error: " + error.getDescription()
                    + " (code: " + error.getErrorCode() + ")");

                // Mark that we're in an error state so NetworkCallback
                // recovery can trigger a reload even if we never managed
                // to call showOfflinePage() (e.g. when Chrome renders its
                // own error page before our callback fires).
                isShowingErrorPage = true;

                // Don't show offline page if we're already on it
                if (!isShowingOfflinePage) {
                    showOfflinePage();
                }
            }
        }

        // Legacy callback for older Android versions
        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            Log.e(TAG, "Legacy WebView error: " + description + " (code: " + errorCode + ")");
            isShowingErrorPage = true;
            if (!isShowingOfflinePage) {
                showOfflinePage();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();

            // Allow navigation only to our domain and file:// assets
            if (url.startsWith("https://pickuplocker.vercel.app") ||
                url.startsWith("file:///android_asset/") ||
                url.startsWith("https://api.dimepay.app")) {
                return false; // Let WebView handle it
            }

            // Block all other navigation (security: prevent phishing redirects)
            Log.w(TAG, "Blocked navigation to: " + url);
            return true;
        }

        /**
         * CRITICAL: Called when the WebView renderer process crashes (OOM kill, etc.)
         * This is the #1 cause of white screens — Android kills the renderer but
         * the Activity is still alive. Without this handler, the WebView shows blank.
         */
        @Override
        public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
            Log.e(TAG, "WebView renderer process GONE! Rebuilding WebView immediately.");

            if (webView != null) {
                try {
                    webView.stopLoading();
                    webView.loadUrl("about:blank");
                    webView.clearCache(true);
                    webView.clearHistory();
                    android.view.ViewGroup parent = (android.view.ViewGroup) webView.getParent();
                    if (parent != null) parent.removeView(webView);
                    webView.destroy();
                } catch (Throwable t) {
                    Log.e(TAG, "Error destroying dead WebView: " + t.getMessage());
                }
                webView = null;
            }

            // Rebuild a fresh WebView after a short delay
            mainHandler.postDelayed(() -> {
                try {
                    // Re-initialize the Capacitor bridge with a new WebView
                    recreate(); // Restart the entire activity — simplest and most reliable
                } catch (Throwable t) {
                    Log.e(TAG, "Failed to restart activity: " + t.getMessage());
                    System.exit(0); // Last resort: kill the process, BootReceiver will restart it
                }
            }, 1000);

            return true; // We handled it
        }
    }

    // ============================================
    // WEB CHROME CLIENT — Console Logging
    // ============================================

    private class KioskWebChromeClient extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
            // Only log errors and warnings to logcat (skip info/debug to reduce noise)
            switch (consoleMessage.messageLevel()) {
                case ERROR:
                    Log.e(TAG, "JS: " + consoleMessage.message()
                        + " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
                    break;
                case WARNING:
                    Log.w(TAG, "JS: " + consoleMessage.message()
                        + " (" + consoleMessage.sourceId() + ":" + consoleMessage.lineNumber() + ")");
                    break;
                default:
                    break; // Skip DEBUG, LOG, TIP to reduce logcat noise
            }
            return true;
        }

        /**
         * Detects Chrome's built-in error pages by their page title.
         *
         * When the WebView fails to load a URL with ERR_NAME_NOT_RESOLVED or
         * similar DNS/network errors, the WebViewClient.onReceivedError
         * callback does NOT reliably fire on all Android versions. Instead,
         * Chrome's internal error page is rendered with a known page title.
         *
         * By checking the title here, we catch the error state that
         * onReceivedError misses, and trigger the branded offline page +
         * retry loop.
         */
        @Override
        public void onReceivedTitle(WebView view, String title) {
            super.onReceivedTitle(view, title);

            if (title == null) return;

            String lower = title.toLowerCase();
            if (lower.contains("webpage not available")
                || lower.contains("not available")
                || lower.contains("err_")
                || lower.contains("can't connect")
                || lower.contains("site can't be reached")
                || lower.contains("unable to connect")) {

                Log.w(TAG, "Chrome error page detected by title: \"" + title + "\"");

                // Mark as error state so NetworkCallback recovery will reload
                isShowingErrorPage = true;

                // Don't show offline page if we're already on it
                if (!isShowingOfflinePage && webView != null) {
                    // Only react to the main frame's title, not subresources
                    String currentUrl = webView.getUrl();
                    if (currentUrl == null
                        || (!currentUrl.equals(OFFLINE_URL)
                            && !currentUrl.equals("about:blank"))) {
                        Log.i(TAG, "Showing offline page due to Chrome error title");
                        showOfflinePage();
                    }
                }
            }
        }
    }

    // ============================================
    // OFFLINE PAGE — Branded Error Screen
    // ============================================

    private void showOfflinePage() {
        isShowingOfflinePage = true;

        if (webView != null) {
            mainHandler.post(() -> {
                webView.loadUrl(OFFLINE_URL);
                Log.i(TAG, "Loaded offline page — will retry connection");
            });
        }

        // Schedule the first reconnect attempt
        scheduleReconnect();
    }

    // ============================================
    // RECONNECT LOGIC
    // ============================================

    private void scheduleReconnect() {
        // No cap — kiosk should retry forever with exponential backoff.
        // 5s → 10s → 20s → 40s → 60s → 60s → 60s ...
        reconnectAttempts++;
        int delayMs = Math.min(
            RECONNECT_DELAY_INITIAL_MS * (1 << Math.min(reconnectAttempts - 1, 10)),
            RECONNECT_DELAY_MAX_MS
        );
        Log.i(TAG, "Reconnect attempt " + reconnectAttempts
            + " (delay " + delayMs + "ms, exponential backoff)");

        mainHandler.postDelayed(() -> {
            if (isShowingOfflinePage || isShowingErrorPage) {
                checkAndReload();
            }
        }, delayMs);
    }

    private void checkAndReload() {
        if (!isNetworkAvailable()) {
            Log.w(TAG, "Still offline — scheduling another reconnect");
            scheduleReconnect();
            return;
        }

        // Network is available — re-run DNS pre-flight, then reload kiosk.
        // DNS pre-flight catches the case where Wi-Fi shows "connected"
        // but DNS is still broken (captive portal, misconfigured router, etc).
        Log.i(TAG, "Network detected — re-running DNS check before reload");
        loadKioskUrlWithDnsCheck();
    }

    // ============================================
    // CONNECTIVITY MONITORING — Auto-Reload on Reconnect
    // ============================================

    private void registerConnectivityMonitoring() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) {
            Log.e(TAG, "ConnectivityManager not available");
            return;
        }

        // Use NetworkCallback API (available since Android 5.0 / API 21)
        NetworkRequest request = new NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED)
            .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                Log.i(TAG, "Network became available: " + network);

                // If we're on the offline page OR showing Chrome's error
                // page, wait a moment for the network to stabilize, then
                // re-run DNS pre-flight and reload the kiosk page.
                if (isShowingOfflinePage || isShowingErrorPage) {
                    mainHandler.postDelayed(() -> {
                        if (isShowingOfflinePage || isShowingErrorPage) {
                            Log.i(TAG, "Network restored while on error page — reloading kiosk");
                            reconnectAttempts = 0; // Reset counter
                            loadKioskUrlWithDnsCheck();
                        }
                    }, CONNECTIVITY_CHECK_MS);
                }
            }

            @Override
            public void onLost(Network network) {
                Log.w(TAG, "Network lost: " + network);
                // We don't immediately show the offline page here because
                // the WebView might still have a cached version working.
                // The WebViewClient.onReceivedError / WebChromeClient.onReceivedTitle
                // will handle it if the page actually fails to load.
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                boolean hasInternet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);

                if (hasInternet && (isShowingOfflinePage || isShowingErrorPage)) {
                    Log.i(TAG, "Validated internet available — reloading kiosk");
                    mainHandler.postDelayed(() -> {
                        if ((isShowingOfflinePage || isShowingErrorPage) && webView != null) {
                            reconnectAttempts = 0;
                            loadKioskUrlWithDnsCheck();
                        }
                    }, CONNECTIVITY_CHECK_MS);
                }
            }
        };

        try {
            cm.registerNetworkCallback(request, networkCallback);
            Log.i(TAG, "Network connectivity monitoring registered");
        } catch (SecurityException e) {
            // Missing ACCESS_NETWORK_STATE permission — fall back gracefully
            Log.e(TAG, "Cannot register network callback (missing permission?): " + e.getMessage());
        }
    }

    private void unregisterConnectivityMonitoring() {
        if (networkCallback != null) {
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) {
                    cm.unregisterNetworkCallback(networkCallback);
                    Log.i(TAG, "Network connectivity monitoring unregistered");
                }
            } catch (Exception e) {
                Log.w(TAG, "Error unregistering network callback: " + e.getMessage());
            }
        }
    }

    // ============================================
    // NETWORK CHECK — Simple connectivity test
    // ============================================

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;

            Network activeNetwork = cm.getActiveNetwork();
            if (activeNetwork == null) return false;

            NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
            return caps != null
                && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (SecurityException e) {
            // If we can't check, assume we have network (optimistic)
            return true;
        }
    }

    // ============================================
    // WEBVIEW HEALTH MONITORING — Detect frozen/white screens
    // ============================================

    /**
     * Starts periodic health checks on the WebView.
     * If the WebView appears unresponsive or has blank content for
     * multiple consecutive checks, force a reload.
     */
    private void startHealthMonitoring() {
        healthCheckRunnable = new Runnable() {
            @Override
            public void run() {
                checkWebViewHealth();
                // Schedule next check
                mainHandler.postDelayed(this, HEALTH_CHECK_INTERVAL_MS);
            }
        };
        // First check after 2 minutes
        mainHandler.postDelayed(healthCheckRunnable, HEALTH_CHECK_INTERVAL_MS);
        Log.i(TAG, "WebView health monitoring started (interval: " + HEALTH_CHECK_INTERVAL_MS + "ms)");
    }

    private void stopHealthMonitoring() {
        if (healthCheckRunnable != null) {
            mainHandler.removeCallbacks(healthCheckRunnable);
            healthCheckRunnable = null;
            Log.i(TAG, "WebView health monitoring stopped");
        }
    }

    /**
     * Check if the WebView is healthy by evaluating its content.
     * If the page appears blank or frozen for several consecutive checks,
     * force a reload to recover.
     */
    private void checkWebViewHealth() {
        if (webView == null) {
            healthCheckFailCount++;
            Log.w(TAG, "Health check: WebView is null (fail " + healthCheckFailCount + "/" + HEALTH_RELOAD_THRESHOLD + ")");
            if (healthCheckFailCount >= HEALTH_RELOAD_THRESHOLD) {
                Log.w(TAG, "Health check: Too many failures — attempting full recovery");
                healthCheckFailCount = 0;
                reloadKiosk();
            }
            return;
        }

        // Use evaluateJavascript to check if the WebView's page has content
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            webView.evaluateJavascript("(function(){ try { var c = document.querySelector('.container'); return c ? 'ok' : 'empty'; } catch(e) { return 'error'; } })()", new android.webkit.ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if (value != null && (value.contains("ok") || value.contains("empty"))) {
                        if (value.contains("empty")) {
                            healthCheckFailCount++;
                            Log.w(TAG, "Health check: Page content empty (fail " + healthCheckFailCount + "/" + HEALTH_RELOAD_THRESHOLD + ")");
                        } else {
                            // Page is healthy
                            if (healthCheckFailCount > 0) {
                                Log.i(TAG, "Health check: Page recovered (was " + healthCheckFailCount + " fails)");
                            }
                            healthCheckFailCount = 0;
                        }
                    } else {
                        healthCheckFailCount++;
                        Log.w(TAG, "Health check: No response or unexpected value: " + value + " (fail " + healthCheckFailCount + "/" + HEALTH_RELOAD_THRESHOLD + ")");
                    }

                    if (healthCheckFailCount >= HEALTH_RELOAD_THRESHOLD) {
                        Log.w(TAG, "Health check: Threshold reached — force reloading kiosk");
                        healthCheckFailCount = 0;
                        reloadKiosk();
                    }
                }
            });
        } else {
            // Pre-KitKat: just check if we're showing offline page
            if (isShowingOfflinePage) {
                healthCheckFailCount++;
                if (healthCheckFailCount >= HEALTH_RELOAD_THRESHOLD) {
                    healthCheckFailCount = 0;
                    reloadKiosk();
                }
            } else {
                healthCheckFailCount = 0;
            }
        }
    }

    // ============================================
    // BACK BUTTON — Prevent exiting kiosk
    // ============================================

    @Override
    public void onBackPressed() {
        // In kiosk mode, never let the user navigate away.
        // If the WebView can go back, do that; otherwise do nothing.
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        }
        // Do NOT call super — prevent exit
    }

    // ============================================
    // SECRET EXIT — Tap top-left corner 5 times
    //
    // How it works:
    //   1. Tap the top-left corner of the screen 5 times within 3 seconds
    //   2. An admin PIN dialog appears
    //   3. Enter the correct PIN (default: 1234) to access options:
    //      - Close App (fully exits the kiosk)
    //      - Android Settings (opens system settings)
    //      - Reload (force-refreshes the WebView)
    //      - Cancel (returns to kiosk)
    //
    //   The tap zone is the top-left 80dp x 80dp area — invisible
    //   to regular users but easy for an admin to find.
    // ============================================

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (ev.getAction() == MotionEvent.ACTION_DOWN) {
            // Convert DP to pixels for the hit area
            float density = getResources().getDisplayMetrics().density;
            float hitAreaPx = SECRET_TAP_AREA_DP * density;

            float x = ev.getRawX();
            float y = ev.getRawY();

            // Check if the tap is in the top-left corner
            if (x < hitAreaPx && y < hitAreaPx) {
                long now = System.currentTimeMillis();

                // Reset counter if too much time has passed since last tap
                if (now - lastSecretTapTime > SECRET_TAP_TIMEOUT_MS) {
                    secretTapCount = 1;
                } else {
                    secretTapCount++;
                }
                lastSecretTapTime = now;

                Log.d(TAG, "Secret tap: " + secretTapCount + "/" + SECRET_TAP_COUNT);

                if (secretTapCount >= SECRET_TAP_COUNT) {
                    secretTapCount = 0;
                    Log.i(TAG, "Secret exit triggered — showing admin dialog");
                    showAdminDialog();
                }

                // Don't consume the touch — let the WebView handle it normally
                // This keeps the secret gesture invisible to regular users
            }
        }
        return super.dispatchTouchEvent(ev);
    }

    /**
     * Show the admin PIN dialog after the secret tap gesture is triggered.
     * On correct PIN, shows options to close app, open settings, or reload.
     */
    private void showAdminDialog() {
        // First, ask for the admin PIN
        EditText pinInput = new EditText(this);
        pinInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        pinInput.setHint("Enter admin PIN");
        pinInput.setMaxLines(1);

        // Style the input field
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lp.setMargins(50, 20, 50, 20);
        pinInput.setLayoutParams(lp);

        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(40, 20, 40, 20);
        container.addView(pinInput);

        new AlertDialog.Builder(this)
            .setTitle("Admin Access")
            .setMessage("Enter the admin PIN to continue.")
            .setView(container)
            .setPositiveButton("Confirm", (dialog, which) -> {
                String enteredPin = pinInput.getText().toString().trim();
                if (enteredPin.equals(ADMIN_EXIT_PIN)) {
                    showAdminOptionsDialog();
                } else {
                    Log.w(TAG, "Incorrect admin PIN entered");
                    new AlertDialog.Builder(this)
                        .setTitle("Incorrect PIN")
                        .setMessage("The PIN you entered is incorrect.")
                        .setPositiveButton("OK", null)
                        .show();
                }
            })
            .setNegativeButton("Cancel", null)
            .setCancelable(true)
            .show();
    }

    /**
     * Show the admin options dialog after PIN is verified.
     * Options: Close App, Android Settings, Reload, Cancel
     */
    private void showAdminOptionsDialog() {
        Log.i(TAG, "Admin access granted — showing options");

        String[] options = {"Close App", "Android Settings", "Reload Kiosk"};

        new AlertDialog.Builder(this)
            .setTitle("Admin Options")
            .setItems(options, (dialog, which) -> {
                switch (which) {
                    case 0: // Close App
                        Log.i(TAG, "Admin chose to close the app");
                        closeApp();
                        break;
                    case 1: // Android Settings
                        Log.i(TAG, "Admin chose to open Android Settings");
                        openAndroidSettings();
                        break;
                    case 2: // Reload Kiosk
                        Log.i(TAG, "Admin chose to reload the kiosk");
                        reloadKiosk();
                        break;
                }
            })
            .setNegativeButton("Cancel", null)
            .setCancelable(true)
            .show();
    }

    /**
     * Close the kiosk app completely.
     */
    private void closeApp() {
        // Clean up resources
        unregisterConnectivityMonitoring();
        mainHandler.removeCallbacksAndMessages(null);

        // Finish the activity
        finishAffinity(); // Close all activities in the task
        System.exit(0);   // Ensure the process is killed
    }

    /**
     * Open Android system Settings app.
     */
    private void openAndroidSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to open Android Settings: " + e.getMessage());
            // Fallback: try the generic settings intent
            try {
                Intent intent = new Intent(Intent.ACTION_MAIN);
                intent.setClassName("com.android.settings", "com.android.settings.Settings");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e2) {
                Log.e(TAG, "Fallback settings intent also failed: " + e2.getMessage());
            }
        }
    }

    /**
     * Force-reload the kiosk WebView.
     */
    private void reloadKiosk() {
        isShowingOfflinePage = false;
        isShowingErrorPage = false;
        reconnectAttempts = 0;
        if (webView != null) {
            webView.clearCache(true);
            // Use DNS pre-flight so we never render Chrome's error page.
            loadKioskUrlWithDnsCheck();
        }
    }
}
