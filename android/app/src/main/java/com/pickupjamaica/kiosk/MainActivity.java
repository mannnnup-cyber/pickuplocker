package com.pickupjamaica.kiosk;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

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
    private static final String OFFLINE_URL = "file:///android_asset/offline.html";
    private static final int RECONNECT_DELAY_MS = 5000;     // 5 seconds
    private static final int MAX_RECONNECT_ATTEMPTS = 60;    // 5 minutes total
    private static final int CONNECTIVITY_CHECK_MS = 3000;   // 3 seconds after network callback

    private WebView webView;
    private Handler mainHandler = new Handler(Looper.getMainLooper());
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean isShowingOfflinePage = false;
    private int reconnectAttempts = 0;


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
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Re-apply immersive mode when returning to the activity
        hideSystemUI();

        // If we were showing the offline page, check if network is back
        if (isShowingOfflinePage) {
            checkAndReload();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Clean up network callback
        unregisterConnectivityMonitoring();
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
            if (BuildConfig.DEBUG) {
                WebView.setWebContentsDebuggingEnabled(true);
            }
            // Release builds default to false, but be explicit
        }

        // Custom WebViewClient for error handling and navigation control
        webView.setWebViewClient(new KioskWebViewClient());

        // Custom WebChromeClient for console logging
        webView.setWebChromeClient(new KioskWebChromeClient());
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
            } else {
                isShowingOfflinePage = false;
                reconnectAttempts = 0;
                Log.i(TAG, "Page loaded successfully: " + url);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            // Only handle main frame errors (not subresources like images/CSS)
            if (request.isForMainFrame()) {
                Log.e(TAG, "Main frame error: " + error.getDescription()
                    + " (code: " + error.getErrorCode() + ")");

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
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Log.e(TAG, "Max reconnect attempts reached — giving up until network callback fires");
            return;
        }

        reconnectAttempts++;
        Log.i(TAG, "Reconnect attempt " + reconnectAttempts + "/" + MAX_RECONNECT_ATTEMPTS);

        mainHandler.postDelayed(() -> {
            if (isShowingOfflinePage) {
                checkAndReload();
            }
        }, RECONNECT_DELAY_MS);
    }

    private void checkAndReload() {
        if (!isNetworkAvailable()) {
            Log.w(TAG, "Still offline — scheduling another reconnect");
            scheduleReconnect();
            return;
        }

        // Network is available — try to reload the kiosk page
        Log.i(TAG, "Network detected — attempting to reload kiosk page");
        if (webView != null) {
            mainHandler.post(() -> {
                webView.loadUrl(KIOSK_URL);
            });
        }
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

                // If we're on the offline page, wait a moment for the
                // network to stabilize, then reload the kiosk page
                if (isShowingOfflinePage) {
                    mainHandler.postDelayed(() -> {
                        if (isShowingOfflinePage) {
                            Log.i(TAG, "Network restored while on offline page — reloading kiosk");
                            reconnectAttempts = 0; // Reset counter
                            if (webView != null) {
                                mainHandler.post(() -> webView.loadUrl(KIOSK_URL));
                            }
                        }
                    }, CONNECTIVITY_CHECK_MS);
                }
            }

            @Override
            public void onLost(Network network) {
                Log.w(TAG, "Network lost: " + network);
                // We don't immediately show the offline page here because
                // the WebView might still have a cached version working.
                // The WebViewClient.onReceivedError will handle it if the
                // page actually fails to load.
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                boolean hasInternet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);

                if (hasInternet && isShowingOfflinePage) {
                    Log.i(TAG, "Validated internet available — reloading kiosk");
                    mainHandler.postDelayed(() -> {
                        if (isShowingOfflinePage && webView != null) {
                            reconnectAttempts = 0;
                            mainHandler.post(() -> webView.loadUrl(KIOSK_URL));
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
}
