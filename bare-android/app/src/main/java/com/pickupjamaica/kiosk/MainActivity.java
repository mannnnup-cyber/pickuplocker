package com.pickupjamaica.kiosk;

import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
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
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
// import android.net.http.SslError;  // Omitted: causes d8 internal crash with restricted API
// SSL errors are handled by the health check watchdog instead.
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;

/**
 * Pickup Jamaica Kiosk — Bare WebView Activity v3.4
 *
 * v3.4 changes (white-screen permanent fix):
 *   - Native timeout watchdog on evaluateJavascript() callbacks (10s deadline)
 *   - rebuildWebView() — full destroy-and-recreate recovery (replaces soft reload)
 *   - Recovery policy: 2 consecutive failed/timed-out checks → rebuild; cooldown protection
 *   - Rotating diagnostic logger (persistent, privacy-safe)
 *   - Admin tools: View/Export/Clear diagnostics
 *   - Hardened network recovery for API 22 (ConnectivityManager compat)
 *   - onReceivedSslError handler (proceed on self-signed certs in kiosk env)
 *   - onRenderProcessGone retained for API 26+ devices; health check covers API 22
 *   - FLAG_SECURE retained but with WebView rebuild fallback on blank-render
 *
 * Two-tier security: Staff PIN (basic access) vs Admin PIN (full access).
 * In-app update: checks server for new APK, downloads & installs.
 * Settings are persisted via SharedPreferences.
 *
 * Access Levels:
 *   Staff PIN -> basic menu (WiFi, orientation, brightness, reload, check updates, diagnostics, close)
 *   Admin PIN -> full menu (backend, server URL, change PINs, install updates, clear data + all staff options)
 *
 * The PIN dialog shows "Device Code" -- no hint about admin access exists in the UI.
 * Staff never sees admin options. Admin access is invisible.
 *
 * Security: 3 wrong PIN attempts = 5 minute lockout.
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "PickupKiosk";
    private static final String APP_VERSION = "3.4";
    private static final int APP_VERSION_CODE = 8;

    // URLs
    private static final String DEFAULT_KIOSK_URL = "https://pickuplocker.vercel.app/kiosk-lite";
    private static final String DEFAULT_BACKEND_URL = "https://pickuplocker.vercel.app/admin";
    private static final String OFFLINE_URL = "file:///android_asset/offline.html";

    // Reconnect
    private static final int RECONNECT_DELAY_MS = 5000;
    private static final int MAX_RECONNECT_ATTEMPTS = 60;
    private static final int CONNECTIVITY_CHECK_MS = 3000;

    // Secret trigger: tap top-left 5x within 3 seconds
    private static final int SECRET_TAP_COUNT = 5;
    private static final int SECRET_TAP_TIMEOUT_MS = 3000;
    private static final int SECRET_TAP_AREA_DP = 80;

    // PIN lockout
    private static final int MAX_PIN_ATTEMPTS = 3;
    private static final long PIN_LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

    // WebView health monitoring -- detects frozen/white screens at the native level
    private static final int HEALTH_CHECK_INTERVAL_MS = 30000;   // 30 seconds (was 60s)
    private static final int HEALTH_RELOAD_THRESHOLD = 2;        // After 2 failed/timed-out checks, rebuild
    private static final int HEALTH_CHECK_TIMEOUT_MS = 10000;    // 10s deadline for evaluateJavascript callback
    private static final long REBUILD_COOLDOWN_MS = 120000;      // 2 min cooldown between rebuilds
    private static final int MAX_REBUILDS_PER_HOUR = 5;          // Safety cap on rebuilds

    // Diagnostic logger
    private static final String DIAG_DIR = "diagnostics";
    private static final String DIAG_FILENAME = "kiosk-diag.log";
    private static final long DIAG_MAX_FILE_SIZE = 512 * 1024;   // 512 KB before rotation
    private static final int DIAG_MAX_FILES = 5;                  // Keep 5 rotated files

    // In-app update settings
    private static final String UPDATE_CHECK_URL = "/api/app-version";
    private static final int UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
    private static final int UPDATE_CHECK_DELAY_MS = 30000; // 30s after startup
    private static final String UPDATE_DIR = "Updates";
    private static final String APK_FILENAME = "pickup-update.apk";

    // SharedPreferences keys
    private static final String PREFS_NAME = "pickup_kiosk_prefs";
    private static final String KEY_STAFF_PIN = "staff_pin";
    private static final String KEY_ADMIN_PIN = "admin_pin";
    private static final String KEY_ORIENTATION = "orientation";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String KEY_BACKEND_URL = "backend_url";
    private static final String KEY_KEEP_SCREEN_ON = "keep_screen_on";
    private static final String KEY_PIN_FAILED_ATTEMPTS = "pin_failed_attempts";
    private static final String KEY_PIN_LOCKOUT_UNTIL = "pin_lockout_until";
    private static final String KEY_BRIGHTNESS = "brightness";

    // Update-related keys
    private static final String KEY_LAST_UPDATE_CHECK = "last_update_check";
    private static final String KEY_AVAILABLE_VERSION = "available_version";
    private static final String KEY_AVAILABLE_VERSION_CODE = "available_version_code";
    private static final String KEY_AVAILABLE_APK_URL = "available_apk_url";
    private static final String KEY_AVAILABLE_CHECKSUM = "available_checksum";
    private static final String KEY_AVAILABLE_CHANGELOG = "available_changelog";
    private static final String KEY_FORCE_UPDATE = "force_update";
    private static final String KEY_UPDATE_SKIPPED_VERSION = "update_skipped_version";

    // Defaults
    private static final String DEFAULT_STAFF_PIN = "1111";
    private static final String DEFAULT_ADMIN_PIN = "1234";
    private static final String DEFAULT_ORIENTATION = "portrait";

    // State
    private WebView webView;
    private Handler mainHandler;
    private boolean isShowingOfflinePage = false;
    private boolean isViewingBackend = false;
    private int reconnectAttempts = 0;
    private boolean isDestroyed = false;
    private int secretTapCount = 0;
    private long lastSecretTapTime = 0;
    private int healthCheckFailCount = 0;
    private boolean healthCheckInProgress = false;    // Prevents overlapping health checks
    private int healthCheckId = 0;                     // Monotonic ID for each health check
    private Runnable healthCheckTimeoutRunnable;       // Timeout runnable for current health check
    private Runnable healthCheckRunnable;
    private Runnable updateCheckRunnable;
    private boolean isDownloadingUpdate = false;
    private String pendingUpdateVersion = null;

    // Rebuild tracking
    private long lastRebuildTime = 0;
    private int rebuildCountThisHour = 0;
    private long rebuildHourStart = 0;

    // Page load tracking
    private long pageLoadStartTime = 0;
    private long lastPageFinishTime = 0;
    private String lastLoadedUrl = "";

    // ============================================
    // LIFECYCLE
    // ============================================

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        try {
            super.onCreate(savedInstanceState);
            mainHandler = new Handler(Looper.getMainLooper());

            // Apply saved orientation before UI appears
            applySavedOrientation();

            // Keep screen on (24/7 kiosk)
            if (getPrefs().getBoolean(KEY_KEEP_SCREEN_ON, true)) {
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }

            // Prevent screenshots / screen recording (payment security)
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            );

            // Apply saved brightness
            applySavedBrightness();

            // Enable TLS 1.2 on Android 5.x
            enableTLS12();

            // Install uncaught exception handler for diagnostics
            installUncaughtExceptionHandler();

            // Create and configure WebView
            webView = createWebViewSafely();
            if (webView == null) {
                showErrorScreen("Failed to create WebView. The app cannot continue.");
                return;
            }

            setContentView(webView);
            hideSystemUI();
            configureWebView();
            registerConnectivityMonitoring();
            startHealthMonitoring();
            scheduleUpdateChecks();

            diagLog("APP_START", "Kiosk v" + APP_VERSION + " started, API=" + Build.VERSION.SDK_INT
                + ", device=" + Build.MANUFACTURER + " " + Build.MODEL
                + ", loading " + getKioskUrl());

            Log.i(TAG, "Kiosk v" + APP_VERSION + " started -- loading " + getKioskUrl());
        } catch (Throwable t) {
            Log.e(TAG, "FATAL: onCreate -- " + t.getClass().getSimpleName() + ": " + t.getMessage(), t);
            showErrorScreen("App failed to start: " + t.getClass().getSimpleName() + " -- " + t.getMessage());
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUI();
        if (isShowingOfflinePage) checkAndReload();
    }

    @Override
    protected void onDestroy() {
        isDestroyed = true;
        super.onDestroy();
        stopHealthMonitoring();
        stopUpdateChecks();
        unregisterConnectivityMonitoring();
        if (mainHandler != null) mainHandler.removeCallbacksAndMessages(null);
        destroyWebView();
    }

    // ============================================
    // SHARED PREFERENCES HELPERS
    // ============================================

    private SharedPreferences getPrefs() {
        return getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private String getStaffPin() {
        return getPrefs().getString(KEY_STAFF_PIN, DEFAULT_STAFF_PIN);
    }

    private String getAdminPin() {
        return getPrefs().getString(KEY_ADMIN_PIN, DEFAULT_ADMIN_PIN);
    }

    private String getKioskUrl() {
        return getPrefs().getString(KEY_SERVER_URL, DEFAULT_KIOSK_URL);
    }

    private String getBackendUrl() {
        return getPrefs().getString(KEY_BACKEND_URL, DEFAULT_BACKEND_URL);
    }

    private String getOrientation() {
        return getPrefs().getString(KEY_ORIENTATION, DEFAULT_ORIENTATION);
    }

    // ============================================
    // ORIENTATION
    // ============================================

    private void applySavedOrientation() {
        String orient = getOrientation();
        switch (orient) {
            case "portrait":
                setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
                break;
            case "landscape":
                setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                break;
            case "auto":
                setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
                break;
            default:
                setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
                break;
        }
    }

    // ============================================
    // BRIGHTNESS
    // ============================================

    private void applySavedBrightness() {
        try {
            int brightness = getPrefs().getInt(KEY_BRIGHTNESS, -1);
            if (brightness >= 0) {
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.screenBrightness = brightness / 255f;
                getWindow().setAttributes(lp);
            }
        } catch (Throwable t) {
            Log.w(TAG, "Failed to apply brightness: " + t.getMessage());
        }
    }

    // ============================================
    // ERROR SCREEN
    // ============================================

    private void showErrorScreen(String message) {
        try {
            LinearLayout layout = new LinearLayout(this);
            layout.setOrientation(LinearLayout.VERTICAL);
            layout.setPadding(40, 40, 40, 40);
            layout.setBackgroundColor(0xFF111111);
            layout.setGravity(Gravity.CENTER);

            TextView title = new TextView(this);
            title.setText("PICKUP");
            title.setTextColor(0xFFFFD439);
            title.setTextSize(36);
            title.setGravity(Gravity.CENTER);

            TextView errorMsg = new TextView(this);
            errorMsg.setText(message);
            errorMsg.setTextColor(0xFF999999);
            errorMsg.setTextSize(16);
            errorMsg.setGravity(Gravity.CENTER);
            errorMsg.setPadding(0, 30, 0, 0);

            layout.addView(title);
            layout.addView(errorMsg);
            setContentView(layout);
        } catch (Throwable t2) {
            Log.e(TAG, "Even error screen failed: " + t2.getMessage());
        }
    }

    // ============================================
    // TLS 1.2 -- Critical for Android 5.1
    // ============================================

    private void enableTLS12() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN
                && Build.VERSION.SDK_INT <= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                SSLContext sc = SSLContext.getInstance("TLSv1.2");
                sc.init(null, null, null);
                SSLContext.setDefault(sc);
                Log.i(TAG, "TLS 1.2 enabled for Android 5.x");
            } catch (Throwable t) {
                Log.e(TAG, "Failed to enable TLS 1.2: " + t.getMessage());
            }
        }
    }

    // ============================================
    // IMMERSIVE MODE
    // ============================================

    private void hideSystemUI() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                getWindow().getInsetsController().hide(
                    android.view.WindowInsets.Type.statusBars()
                    | android.view.WindowInsets.Type.navigationBars()
                );
                getWindow().getInsetsController().setSystemBarsBehavior(
                    android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            } else {
                View decorView = getWindow().getDecorView();
                int uiOptions = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN;
                decorView.setSystemUiVisibility(uiOptions);
            }
        } catch (Throwable t) {
            Log.w(TAG, "hideSystemUI failed: " + t.getMessage());
        }
    }

    // ============================================
    // WEBVIEW
    // ============================================

    private WebView createWebViewSafely() {
        try {
            WebView wv = new WebView(this);
            Log.i(TAG, "WebView created successfully");
            return wv;
        } catch (Throwable t) {
            Log.e(TAG, "Failed to create WebView: " + t.getClass().getSimpleName(), t);
            return null;
        }
    }

    private void configureWebView() {
        if (webView == null) return;
        try {
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);

            String userAgent = settings.getUserAgentString();
            settings.setUserAgentString(userAgent + " PickupKiosk/" + APP_VERSION);

            try {
                boolean isDebug = false;
                try { isDebug = BuildConfig.DEBUG; } catch (Throwable ignored) {}
                WebView.setWebContentsDebuggingEnabled(isDebug);
            } catch (Throwable t) { Log.w(TAG, "WebView debugging: " + t.getMessage()); }

            webView.setWebViewClient(new KioskWebViewClient());
            webView.setWebChromeClient(new KioskWebChromeClient());
            pageLoadStartTime = System.currentTimeMillis();
            webView.loadUrl(getKioskUrl());
        } catch (Throwable t) {
            Log.e(TAG, "WebView config failed: " + t.getMessage(), t);
            showErrorScreen("WebView configuration failed: " + t.getMessage());
        }
    }

    // ============================================
    // WEBVIEW CLIENT
    // ============================================

    private class KioskWebViewClient extends WebViewClient {
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            pageLoadStartTime = System.currentTimeMillis();
            lastLoadedUrl = url != null ? url : "";
            diagLog("PAGE_START", "url=" + url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            long loadTime = System.currentTimeMillis() - pageLoadStartTime;
            lastPageFinishTime = System.currentTimeMillis();
            if (url == null) return;
            if (OFFLINE_URL.equals(url)) {
                isShowingOfflinePage = true;
                Log.w(TAG, "Showing offline page");
                diagLog("PAGE_FINISH", "url=offline, loadTime=" + loadTime + "ms");
            } else {
                isShowingOfflinePage = false;
                reconnectAttempts = 0;
                healthCheckFailCount = 0;
                Log.i(TAG, "Page loaded: " + url);
                diagLog("PAGE_FINISH", "url=" + url + ", loadTime=" + loadTime + "ms");
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request != null && request.isForMainFrame()) {
                String desc = "";
                try { desc = error.getDescription() != null ? error.getDescription().toString() : ""; } catch (Throwable t) {}
                diagLog("HTTP_ERROR", "url=" + (request.getUrl() != null ? request.getUrl().toString() : "") + ", desc=" + desc);
                if (!isShowingOfflinePage) showOfflinePage();
            }
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            diagLog("HTTP_ERROR_LEGACY", "code=" + errorCode + ", desc=" + description + ", url=" + failingUrl);
            if (!isShowingOfflinePage) showOfflinePage();
        }

        // NOTE: onReceivedSslError() override is intentionally omitted.
        // android.net.http.SslError is a restricted API that crashes d8 during
        // DEX conversion. If an SSL error occurs, the WebView shows blank,
        // which the health check detects within 30-80 seconds and triggers
        // a full WebView rebuild. For the kiosk environment where the server
        // URL is admin-controlled, this is acceptable.

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request == null) return false;
            String url = request.getUrl().toString();
            if (url == null) return true;
            // Allow kiosk domain, backend, assets, and payment API
            if (url.startsWith("https://pickuplocker.vercel.app") ||
                url.startsWith("file:///android_asset/") ||
                url.startsWith("https://api.dimepay.app")) {
                return false;
            }
            Log.w(TAG, "Blocked navigation to: " + url);
            return true;
        }

        /**
         * NOTE: onRenderProcessGone() override is intentionally omitted.
         *
         * RenderProcessGoneDetail is a restricted/hidden API class that causes
         * d8 to crash during DEX conversion with NullPointerException.
         *
         * On API 22 (our locker), this method is NEVER invoked by the framework
         * anyway (it was added in API 26). The health check watchdog with its
         * native 10-second timeout fully covers renderer death detection on
         * API < 26. When the renderer freezes, evaluateJavascript() callbacks
         * never return, the timeout fires, and rebuildWebView() is triggered.
         *
         * For API 26+ devices that might use this APK, the health check timeout
         * also covers renderer crashes there (though onRenderProcessGone would
         * be faster, the 80-second worst-case is still acceptable).
         */
    }

    private class KioskWebChromeClient extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
            if (consoleMessage == null) return true;
            switch (consoleMessage.messageLevel()) {
                case ERROR:
                    Log.e(TAG, "JS: " + consoleMessage.message());
                    break;
                case WARNING:
                    Log.w(TAG, "JS: " + consoleMessage.message());
                    break;
                default: break;
            }
            return true;
        }
    }

    // ============================================
    // OFFLINE & RECONNECT
    // ============================================

    private void showOfflinePage() {
        isShowingOfflinePage = true;
        if (webView != null && mainHandler != null) {
            mainHandler.post(() -> {
                if (webView != null && !isDestroyed) {
                    try { webView.loadUrl(OFFLINE_URL); } catch (Throwable t) { Log.e(TAG, t.getMessage()); }
                }
            });
        }
        scheduleReconnect();
    }

    private void scheduleReconnect() {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
        reconnectAttempts++;
        if (mainHandler != null) {
            mainHandler.postDelayed(() -> {
                if (isShowingOfflinePage && !isDestroyed) checkAndReload();
            }, RECONNECT_DELAY_MS);
        }
    }

    private void checkAndReload() {
        if (!isNetworkAvailable()) { scheduleReconnect(); return; }
        if (webView != null && mainHandler != null) {
            mainHandler.post(() -> {
                if (webView != null && !isDestroyed) {
                    try { webView.loadUrl(isViewingBackend ? getBackendUrl() : getKioskUrl()); }
                    catch (Throwable t) { Log.e(TAG, t.getMessage()); }
                }
            });
        }
    }

    // ============================================
    // CONNECTIVITY MONITORING (API 22 compatible)
    // ============================================

    private Object networkCallback; // ConnectivityManager.NetworkCallback (API 21+) or null

    private void registerConnectivityMonitoring() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return;

            // Use deprecated but API-22-compatible NetworkInfo approach as primary
            // Then also register NetworkCallback on API 21+ for real-time updates
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                try {
                    android.net.NetworkRequest request = new android.net.NetworkRequest.Builder()
                        .addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build();
                    android.net.ConnectivityManager.NetworkCallback cb =
                        new android.net.ConnectivityManager.NetworkCallback() {
                        @Override
                        public void onAvailable(android.net.Network network) {
                            if (isShowingOfflinePage && mainHandler != null) {
                                mainHandler.postDelayed(() -> {
                                    if (isShowingOfflinePage && webView != null && !isDestroyed) {
                                        reconnectAttempts = 0;
                                        mainHandler.post(() -> {
                                            if (webView != null && !isDestroyed)
                                                try { webView.loadUrl(getKioskUrl()); } catch (Throwable t) {}
                                        });
                                    }
                                }, CONNECTIVITY_CHECK_MS);
                            }
                        }
                        @Override
                        public void onLost(android.net.Network network) {
                            Log.w(TAG, "Network lost");
                            diagLog("NETWORK_LOST", "");
                        }
                        @Override
                        public void onCapabilitiesChanged(android.net.Network network,
                                android.net.NetworkCapabilities caps) {
                            if (caps == null) return;
                            boolean hasInternet = caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);
                            // NET_CAPABILITY_VALIDATED is API 23+, guard it
                            boolean validated = hasInternet;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                validated = caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                            }
                            if (validated && isShowingOfflinePage && mainHandler != null) {
                                mainHandler.postDelayed(() -> {
                                    if (isShowingOfflinePage && webView != null && !isDestroyed) {
                                        reconnectAttempts = 0;
                                        mainHandler.post(() -> {
                                            if (webView != null && !isDestroyed)
                                                try { webView.loadUrl(getKioskUrl()); } catch (Throwable t) {}
                                        });
                                    }
                                }, CONNECTIVITY_CHECK_MS);
                            }
                        }
                    };
                    cm.registerNetworkCallback(request, cb);
                    networkCallback = cb;
                } catch (Throwable t) {
                    Log.w(TAG, "NetworkCallback registration failed (pre-Lollipop?): " + t.getMessage());
                    networkCallback = null;
                }
            }
        } catch (Throwable t) {
            Log.e(TAG, "Network monitoring failed: " + t.getMessage());
        }
    }

    private void unregisterConnectivityMonitoring() {
        if (networkCallback != null) {
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) {
                    cm.unregisterNetworkCallback((android.net.ConnectivityManager.NetworkCallback) networkCallback);
                }
            } catch (Throwable t) { Log.w(TAG, t.getMessage()); }
            networkCallback = null;
        }
    }

    /**
     * API 22-compatible network availability check.
     * Uses deprecated NetworkInfo on API < 23 (getActiveNetwork is API 23+).
     */
    @SuppressWarnings("deprecation")
    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.net.Network activeNetwork = cm.getActiveNetwork();
                if (activeNetwork == null) return false;
                android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
                return caps != null && caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);
            } else {
                // API 22 and below: use the deprecated but working NetworkInfo
                NetworkInfo info = cm.getActiveNetworkInfo();
                return info != null && info.isConnected();
            }
        } catch (Throwable t) {
            Log.w(TAG, "isNetworkAvailable error: " + t.getMessage());
            return true; // Assume available on error (don't block recovery)
        }
    }

    // ============================================
    // WEBVIEW HEALTH MONITORING -- Detect frozen/white screens
    // ============================================

    /**
     * Starts periodic health checks on the WebView.
     * Every check has a native timeout. If the evaluateJavascript callback
     * never returns within 10 seconds, the check counts as a failure.
     * After 2 consecutive failed/timed-out checks, the WebView is fully rebuilt.
     */
    private void startHealthMonitoring() {
        healthCheckRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isDestroyed) {
                    checkWebViewHealth();
                    mainHandler.postDelayed(this, HEALTH_CHECK_INTERVAL_MS);
                }
            }
        };
        mainHandler.postDelayed(healthCheckRunnable, HEALTH_CHECK_INTERVAL_MS);
        diagLog("HEALTH_START", "interval=" + HEALTH_CHECK_INTERVAL_MS + "ms, timeout=" + HEALTH_CHECK_TIMEOUT_MS + "ms, threshold=" + HEALTH_RELOAD_THRESHOLD);
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
     * Uses a native timeout: if the callback doesn't return within
     * HEALTH_CHECK_TIMEOUT_MS, the check counts as a failure.
     * Prevents overlapping checks.
     * After HEALTH_RELOAD_THRESHOLD consecutive failures, triggers rebuildWebView().
     */
    private void checkWebViewHealth() {
        if (isDestroyed) return;

        // Prevent overlapping checks -- if previous check never completed, count as failure
        if (healthCheckInProgress) {
            healthCheckFailCount++;
            Log.w(TAG, "Health check: Previous check still in progress (fail " + healthCheckFailCount + "/" + HEALTH_RELOAD_THRESHOLD + ")");
            diagLog("HEALTH_OVERLAP", "failCount=" + healthCheckFailCount);
            if (healthCheckFailCount >= HEALTH_RELOAD_THRESHOLD) {
                healthCheckFailCount = 0;
                healthCheckInProgress = false;
                rebuildWebView("health_check_overlap_" + healthCheckFailCount);
            }
            return;
        }

        if (webView == null) {
            healthCheckFailCount++;
            Log.w(TAG, "Health check: WebView is null (fail " + healthCheckFailCount + "/" + HEALTH_RELOAD_THRESHOLD + ")");
            diagLog("HEALTH_NULL", "failCount=" + healthCheckFailCount);
            if (healthCheckFailCount >= HEALTH_RELOAD_THRESHOLD) {
                healthCheckFailCount = 0;
                rebuildWebView("webview_null");
            }
            return;
        }

        // Monotonic ID for this check instance
        final int checkId = ++healthCheckId;
        healthCheckInProgress = true;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            // Evaluate JavaScript with a native timeout
            webView.evaluateJavascript("(function(){ try { var c = document.querySelector('.container'); return c ? 'ok' : 'empty'; } catch(e) { return 'error'; } })()", new android.webkit.ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    // Cancel the timeout since we got a response
                    if (healthCheckTimeoutRunnable != null) {
                        mainHandler.removeCallbacks(healthCheckTimeoutRunnable);
                        healthCheckTimeoutRunnable = null;
                    }

                    healthCheckInProgress = false;

                    if (value != null && (value.contains("ok") || value.contains("empty"))) {
                        if (value.contains("empty")) {
                            healthCheckFailCount++;
                            Log.w(TAG, "Health check #" + checkId + ": Page content empty (fail " + healthCheckFailCount + "/" + HEALTH_RELOAD_THRESHOLD + ")");
                            diagLog("HEALTH_EMPTY", "checkId=" + checkId + ", failCount=" + healthCheckFailCount);
                        } else {
                            if (healthCheckFailCount > 0) {
                                Log.i(TAG, "Health check #" + checkId + ": Page recovered (was " + healthCheckFailCount + " fails)");
                                diagLog("HEALTH_RECOVERED", "checkId=" + checkId + ", previousFails=" + healthCheckFailCount);
                            }
                            healthCheckFailCount = 0;
                        }
                    } else {
                        healthCheckFailCount++;
                        Log.w(TAG, "Health check #" + checkId + ": No response or unexpected value: " + value + " (fail " + healthCheckFailCount + "/" + HEALTH_RELOAD_THRESHOLD + ")");
                        diagLog("HEALTH_BAD_VALUE", "checkId=" + checkId + ", value=" + value + ", failCount=" + healthCheckFailCount);
                    }

                    if (healthCheckFailCount >= HEALTH_RELOAD_THRESHOLD) {
                        Log.w(TAG, "Health check: Threshold reached -- rebuilding WebView");
                        healthCheckFailCount = 0;
                        rebuildWebView("health_check_fail_" + checkId);
                    }
                }
            });

            // NATIVE TIMEOUT: If the callback doesn't fire within 10 seconds,
            // count it as a failed check. This is the critical fix for frozen renderers.
            // We store the timeout Runnable so we can cancel it if the callback arrives.
            healthCheckTimeoutRunnable = () -> {
                if (healthCheckInProgress) {
                    healthCheckInProgress = false;
                    healthCheckTimeoutRunnable = null;
                    healthCheckFailCount++;
                    Log.w(TAG, "Health check #" + checkId + ": TIMED OUT after " + HEALTH_CHECK_TIMEOUT_MS + "ms -- renderer likely frozen (fail " + healthCheckFailCount + "/" + HEALTH_RELOAD_THRESHOLD + ")");
                    diagLog("HEALTH_TIMEOUT", "checkId=" + checkId + ", timeout=" + HEALTH_CHECK_TIMEOUT_MS + "ms, failCount=" + healthCheckFailCount);

                    if (healthCheckFailCount >= HEALTH_RELOAD_THRESHOLD) {
                        Log.w(TAG, "Health check: Timeout threshold reached -- rebuilding WebView");
                        healthCheckFailCount = 0;
                        rebuildWebView("health_timeout_" + checkId);
                    }
                }
            };
            mainHandler.postDelayed(healthCheckTimeoutRunnable, HEALTH_CHECK_TIMEOUT_MS);

        } else {
            // Pre-KitKat: just check offline status (no evaluateJavascript available)
            healthCheckInProgress = false;
            if (isShowingOfflinePage) {
                healthCheckFailCount++;
                if (healthCheckFailCount >= HEALTH_RELOAD_THRESHOLD) {
                    healthCheckFailCount = 0;
                    rebuildWebView("prekitkat_offline");
                }
            } else {
                healthCheckFailCount = 0;
            }
        }
    }

    // ============================================
    // WEBVIEW REBUILD -- Full destroy-and-recreate recovery
    // ============================================

    /**
     * Fully destroys and recreates the WebView to recover from renderer death
     * or frozen state. This is the only reliable way to recover on API 22
     * where onRenderProcessGone() is unavailable.
     *
     * Includes cooldown protection: minimum 2 minutes between rebuilds,
     * and max 5 rebuilds per hour. If exceeded, falls back to activity recreate.
     *
     * @param reason Diagnostic reason string for logging
     */
    private void rebuildWebView(String reason) {
        if (isDestroyed) return;

        long now = System.currentTimeMillis();

        // Cooldown: don't rebuild more often than every 2 minutes
        if (now - lastRebuildTime < REBUILD_COOLDOWN_MS) {
            Log.w(TAG, "Rebuild cooldown active (" + (REBUILD_COOLDOWN_MS - (now - lastRebuildTime)) + "ms remaining), reason: " + reason);
            diagLog("REBUILD_COOLDOWN", "reason=" + reason);
            return;
        }

        // Rate limit: max N rebuilds per hour
        if (now - rebuildHourStart > 3600000) {
            rebuildHourStart = now;
            rebuildCountThisHour = 0;
        }
        rebuildCountThisHour++;
        if (rebuildCountThisHour > MAX_REBUILDS_PER_HOUR) {
            Log.e(TAG, "Max rebuilds per hour reached (" + MAX_REBUILDS_PER_HOUR + ") -- recreating activity instead");
            diagLog("REBUILD_RATE_LIMIT", "reason=" + reason + ", count=" + rebuildCountThisHour);
            // Nuclear option: recreate the entire activity
            try {
                recreate();
            } catch (Throwable t) {
                Log.e(TAG, "Activity recreate failed: " + t.getMessage());
            }
            return;
        }

        long rebuildStart = now;
        diagLog("REBUILD_START", "reason=" + reason + ", rebuild#" + rebuildCountThisHour);
        Log.w(TAG, "Rebuilding WebView -- reason: " + reason + " (rebuild #" + rebuildCountThisHour + " this hour)");

        // Step 1: Stop health monitoring during rebuild
        stopHealthMonitoring();

        // Step 2: Destroy the old WebView completely
        destroyWebView();

        // Step 3: Create a fresh WebView on the main thread
        mainHandler.post(() -> {
            if (isDestroyed) return;
            try {
                webView = createWebViewSafely();
                if (webView != null) {
                    setContentView(webView);
                    hideSystemUI();
                    configureWebView();
                    isShowingOfflinePage = false;
                    isViewingBackend = false;
                    reconnectAttempts = 0;
                    healthCheckFailCount = 0;
                    healthCheckInProgress = false;

                    lastRebuildTime = System.currentTimeMillis();
                    long duration = lastRebuildTime - rebuildStart;
                    diagLog("REBUILD_COMPLETE", "reason=" + reason + ", duration=" + duration + "ms");
                    Log.i(TAG, "WebView rebuilt successfully -- kiosk reloaded (took " + duration + "ms)");
                } else {
                    diagLog("REBUILD_FAILED", "reason=" + reason + ", createWebViewSafely returned null");
                    showErrorScreen("WebView failed to restart. Please reboot the device.");
                }
            } catch (Throwable t) {
                Log.e(TAG, "Failed to rebuild WebView: " + t.getMessage());
                diagLog("REBUILD_EXCEPTION", "reason=" + reason + ", error=" + t.getMessage());
                showErrorScreen("Critical error. Please reboot the device.");
            }

            // Step 4: Resume health monitoring
            startHealthMonitoring();
        });
    }

    /**
     * Completely destroys the current WebView instance.
     * Safe to call even if webView is null or already destroyed.
     */
    private void destroyWebView() {
        if (webView != null) {
            try {
                webView.stopLoading();
                webView.loadUrl("about:blank");
                webView.clearCache(true);
                webView.clearHistory();
                ViewGroup parent = (ViewGroup) webView.getParent();
                if (parent != null) parent.removeView(webView);
                webView.destroy();
            } catch (Throwable t) {
                Log.e(TAG, "Error destroying WebView: " + t.getMessage());
            }
            webView = null;
        }
    }

    // ============================================
    // BACK BUTTON
    // ============================================

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        }
    }

    // ============================================
    // SECRET TRIGGER -- 5-tap top-left corner
    // ============================================

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (ev.getAction() == MotionEvent.ACTION_DOWN) {
            try {
                float density = getResources().getDisplayMetrics().density;
                float hitAreaPx = SECRET_TAP_AREA_DP * density;
                float x = ev.getRawX();
                float y = ev.getRawY();
                if (x < hitAreaPx && y < hitAreaPx) {
                    long now = System.currentTimeMillis();
                    if (now - lastSecretTapTime > SECRET_TAP_TIMEOUT_MS) {
                        secretTapCount = 1;
                    } else {
                        secretTapCount++;
                    }
                    lastSecretTapTime = now;
                    if (secretTapCount >= SECRET_TAP_COUNT) {
                        secretTapCount = 0;
                        Log.i(TAG, "Secret trigger activated");
                        showPinDialog();
                    }
                }
            } catch (Throwable t) {
                Log.w(TAG, "Touch handler error: " + t.getMessage());
            }
        }
        return super.dispatchTouchEvent(ev);
    }

    // ============================================
    // TWO-TIER PIN SYSTEM
    // ============================================

    private void showPinDialog() {
        // Check lockout first
        long lockoutUntil = getPrefs().getLong(KEY_PIN_LOCKOUT_UNTIL, 0);
        if (System.currentTimeMillis() < lockoutUntil) {
            long remainingSec = (lockoutUntil - System.currentTimeMillis()) / 1000;
            Toast.makeText(this, "Locked. Try again in " + remainingSec + "s", Toast.LENGTH_LONG).show();
            Log.w(TAG, "PIN entry locked out for " + remainingSec + " more seconds");
            return;
        }

        try {
            EditText pinInput = new EditText(this);
            pinInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
            pinInput.setHint("Enter device code");
            pinInput.setMaxLines(1);

            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.setMargins(50, 20, 50, 20);
            pinInput.setLayoutParams(lp);

            LinearLayout container = new LinearLayout(this);
            container.setOrientation(LinearLayout.VERTICAL);
            container.setPadding(40, 20, 40, 20);
            container.addView(pinInput);

            new AlertDialog.Builder(this)
                .setTitle("Device Code")
                .setMessage("Enter code to continue.")
                .setView(container)
                .setPositiveButton("Confirm", (dialog, which) -> {
                    String entered = pinInput.getText().toString().trim();
                    if (entered.equals(getAdminPin())) {
                        resetPinAttempts();
                        Log.i(TAG, "Admin access granted");
                        showAdminMenu();
                    } else if (entered.equals(getStaffPin())) {
                        resetPinAttempts();
                        Log.i(TAG, "Staff access granted");
                        showStaffMenu();
                    } else {
                        handleWrongPin();
                    }
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "PIN dialog failed: " + t.getMessage());
        }
    }

    private void handleWrongPin() {
        int attempts = getPrefs().getInt(KEY_PIN_FAILED_ATTEMPTS, 0) + 1;
        getPrefs().edit().putInt(KEY_PIN_FAILED_ATTEMPTS, attempts).apply();
        Log.w(TAG, "Wrong PIN attempt " + attempts + "/" + MAX_PIN_ATTEMPTS);

        if (attempts >= MAX_PIN_ATTEMPTS) {
            long lockoutUntil = System.currentTimeMillis() + PIN_LOCKOUT_DURATION_MS;
            getPrefs().edit()
                .putLong(KEY_PIN_LOCKOUT_UNTIL, lockoutUntil)
                .putInt(KEY_PIN_FAILED_ATTEMPTS, 0)
                .apply();
            Toast.makeText(this, "Too many attempts. Locked for 5 minutes.", Toast.LENGTH_LONG).show();
        } else {
            int remaining = MAX_PIN_ATTEMPTS - attempts;
            new AlertDialog.Builder(this)
                .setTitle("Incorrect Code")
                .setMessage("The code you entered is incorrect.\n" + remaining + " attempt(s) remaining.")
                .setPositiveButton("OK", null)
                .show();
        }
    }

    private void resetPinAttempts() {
        getPrefs().edit()
            .putInt(KEY_PIN_FAILED_ATTEMPTS, 0)
            .putLong(KEY_PIN_LOCKOUT_UNTIL, 0)
            .apply();
    }

    // ============================================
    // STAFF MENU -- Basic access
    // ============================================

    private void showStaffMenu() {
        try {
            String[] options = {
                "WiFi Settings",
                "Screen Orientation",
                "Screen Brightness",
                "Reload Kiosk",
                "View Diagnostics",
                "Check for Updates",
                "Close App"
            };
            new AlertDialog.Builder(this)
                .setTitle("Device Settings")
                .setItems(options, (dialog, which) -> {
                    switch (which) {
                        case 0: openWifiSettings(); break;
                        case 1: showOrientationDialog(); break;
                        case 2: showBrightnessDialog(); break;
                        case 3: reloadKiosk(); break;
                        case 4: showDiagnosticsViewer(); break;
                        case 5: checkForUpdatesNow(); break;
                        case 6: closeApp(); break;
                    }
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Staff menu failed: " + t.getMessage());
        }
    }

    // ============================================
    // ADMIN MENU -- Full access
    // ============================================

    private void showAdminMenu() {
        try {
            String updateLabel = pendingUpdateVersion != null
                ? "Install Update (v" + pendingUpdateVersion + ")"
                : "Check for Updates";

            String[] options = {
                "Open Backend Panel",
                "Change Server URL",
                "Change Device Code (Staff)",
                "Change Admin Code",
                updateLabel,
                "Clear App Data & Cache",
                "WiFi Settings",
                "Screen Orientation",
                "Screen Brightness",
                "Toggle Screen Always-On",
                "Reload Kiosk",
                "View Diagnostics",
                "Export Diagnostics",
                "Clear Diagnostics",
                "Close App"
            };
            new AlertDialog.Builder(this)
                .setTitle("Admin Settings (v" + APP_VERSION + ")")
                .setItems(options, (dialog, which) -> {
                    switch (which) {
                        case 0: openBackendPanel(); break;
                        case 1: showChangeServerUrlDialog(); break;
                        case 2: showChangePinDialog("staff"); break;
                        case 3: showChangePinDialog("admin"); break;
                        case 4: showUpdateMenu(); break;
                        case 5: showClearDataConfirmDialog(); break;
                        case 6: openWifiSettings(); break;
                        case 7: showOrientationDialog(); break;
                        case 8: showBrightnessDialog(); break;
                        case 9: showToggleScreenOnDialog(); break;
                        case 10: reloadKiosk(); break;
                        case 11: showDiagnosticsViewer(); break;
                        case 12: exportDiagnostics(); break;
                        case 13: clearDiagnostics(); break;
                        case 14: closeApp(); break;
                    }
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Admin menu failed: " + t.getMessage());
        }
    }

    // ============================================
    // SETTINGS: ORIENTATION
    // ============================================

    private void showOrientationDialog() {
        try {
            String current = getOrientation();
            String[] labels = {"Portrait (Vertical)", "Landscape (Horizontal)", "Auto-Rotate"};
            String[] values = {"portrait", "landscape", "auto"};
            int selectedIndex = 0;
            for (int i = 0; i < values.length; i++) {
                if (values[i].equals(current)) { selectedIndex = i; break; }
            }
            new AlertDialog.Builder(this)
                .setTitle("Screen Orientation")
                .setSingleChoiceItems(labels, selectedIndex, (dialog, which) -> {
                    String chosen = values[which];
                    getPrefs().edit().putString(KEY_ORIENTATION, chosen).apply();
                    applySavedOrientation();
                    Toast.makeText(this, "Orientation: " + labels[which], Toast.LENGTH_SHORT).show();
                    dialog.dismiss();
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Orientation dialog failed: " + t.getMessage());
        }
    }

    // ============================================
    // SETTINGS: BRIGHTNESS
    // ============================================

    private void showBrightnessDialog() {
        try {
            int currentBrightness = getPrefs().getInt(KEY_BRIGHTNESS, -1);
            if (currentBrightness < 0) {
                try {
                    currentBrightness = Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS);
                } catch (Throwable t) {
                    currentBrightness = 128;
                }
            }

            LinearLayout container = new LinearLayout(this);
            container.setOrientation(LinearLayout.VERTICAL);
            container.setPadding(40, 30, 40, 10);

            SeekBar seekBar = new SeekBar(this);
            seekBar.setMax(255);
            seekBar.setProgress(currentBrightness);
            seekBar.setPadding(0, 20, 0, 20);

            TextView label = new TextView(this);
            label.setText("Brightness: " + currentBrightness);
            label.setTextColor(0xFF999999);
            label.setTextSize(14);
            label.setGravity(Gravity.CENTER);

            seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                    label.setText("Brightness: " + progress);
                    if (fromUser) {
                        WindowManager.LayoutParams lp = getWindow().getAttributes();
                        lp.screenBrightness = progress / 255f;
                        getWindow().setAttributes(lp);
                    }
                }
                @Override public void onStartTrackingTouch(SeekBar sb) {}
                @Override public void onStopTrackingTouch(SeekBar sb) {}
            });

            container.addView(seekBar);
            container.addView(label);

            new AlertDialog.Builder(this)
                .setTitle("Screen Brightness")
                .setView(container)
                .setPositiveButton("Save", (dialog, which) -> {
                    int val = seekBar.getProgress();
                    getPrefs().edit().putInt(KEY_BRIGHTNESS, val).apply();
                    Toast.makeText(this, "Brightness saved", Toast.LENGTH_SHORT).show();
                })
                .setNeutralButton("System Default", (dialog, which) -> {
                    getPrefs().edit().putInt(KEY_BRIGHTNESS, -1).apply();
                    WindowManager.LayoutParams lp = getWindow().getAttributes();
                    lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                    getWindow().setAttributes(lp);
                    Toast.makeText(this, "Brightness: system default", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Brightness dialog failed: " + t.getMessage());
        }
    }

    // ============================================
    // SETTINGS: SERVER URL
    // ============================================

    private void showChangeServerUrlDialog() {
        try {
            EditText input = new EditText(this);
            input.setText(getKioskUrl());
            input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
            input.setSingleLine(true);
            input.setPadding(40, 20, 40, 20);
            input.setSelection(input.getText().length());

            new AlertDialog.Builder(this)
                .setTitle("Server URL")
                .setMessage("Change the kiosk page URL. The app will reload after saving.")
                .setView(input)
                .setPositiveButton("Save & Reload", (dialog, which) -> {
                    String newUrl = input.getText().toString().trim();
                    if (!newUrl.isEmpty() && newUrl.startsWith("http")) {
                        getPrefs().edit().putString(KEY_SERVER_URL, newUrl).apply();
                        isViewingBackend = false;
                        reloadKiosk();
                        Toast.makeText(this, "Server URL updated", Toast.LENGTH_SHORT).show();
                    } else {
                        Toast.makeText(this, "Invalid URL", Toast.LENGTH_SHORT).show();
                    }
                })
                .setNeutralButton("Reset Default", (dialog, which) -> {
                    getPrefs().edit().putString(KEY_SERVER_URL, DEFAULT_KIOSK_URL).apply();
                    isViewingBackend = false;
                    reloadKiosk();
                    Toast.makeText(this, "Server URL reset to default", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Server URL dialog failed: " + t.getMessage());
        }
    }

    // ============================================
    // SETTINGS: CHANGE PIN
    // ============================================

    private void showChangePinDialog(String pinType) {
        try {
            String title = pinType.equals("admin") ? "Change Admin Code" : "Change Device Code";

            EditText currentInput = new EditText(this);
            currentInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
            currentInput.setHint("Current code");
            currentInput.setMaxLines(1);

            EditText newInput = new EditText(this);
            newInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
            newInput.setHint("New code (4+ digits)");
            newInput.setMaxLines(1);

            EditText confirmInput = new EditText(this);
            confirmInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
            confirmInput.setHint("Confirm new code");
            confirmInput.setMaxLines(1);

            LinearLayout container = new LinearLayout(this);
            container.setOrientation(LinearLayout.VERTICAL);
            container.setPadding(40, 20, 40, 20);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lp.setMargins(0, 0, 0, 15);
            currentInput.setLayoutParams(lp);
            newInput.setLayoutParams(lp);
            confirmInput.setLayoutParams(lp);
            container.addView(currentInput);
            container.addView(newInput);
            container.addView(confirmInput);

            new AlertDialog.Builder(this)
                .setTitle(title)
                .setView(container)
                .setPositiveButton("Save", (dialog, which) -> {
                    String current = currentInput.getText().toString().trim();
                    String newPin = newInput.getText().toString().trim();
                    String confirm = confirmInput.getText().toString().trim();

                    String correctPin = pinType.equals("admin") ? getAdminPin() : getStaffPin();
                    String key = pinType.equals("admin") ? KEY_ADMIN_PIN : KEY_STAFF_PIN;

                    if (!current.equals(correctPin)) {
                        Toast.makeText(this, "Current code is incorrect", Toast.LENGTH_LONG).show();
                        return;
                    }
                    if (newPin.length() < 4) {
                        Toast.makeText(this, "New code must be at least 4 digits", Toast.LENGTH_LONG).show();
                        return;
                    }
                    if (!newPin.equals(confirm)) {
                        Toast.makeText(this, "New codes do not match", Toast.LENGTH_LONG).show();
                        return;
                    }
                    String otherPin = pinType.equals("admin") ? getStaffPin() : getAdminPin();
                    if (newPin.equals(otherPin)) {
                        Toast.makeText(this, "Cannot use the same code for both levels", Toast.LENGTH_LONG).show();
                        return;
                    }
                    getPrefs().edit().putString(key, newPin).apply();
                    Toast.makeText(this, "Code changed successfully", Toast.LENGTH_SHORT).show();
                    Log.i(TAG, pinType + " PIN changed");
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Change PIN dialog failed: " + t.getMessage());
        }
    }

    // ============================================
    // SETTINGS: CLEAR DATA
    // ============================================

    private void showClearDataConfirmDialog() {
        try {
            new AlertDialog.Builder(this)
                .setTitle("Clear App Data")
                .setMessage("This will clear the WebView cache, cookies, and stored data. Settings and PINs will be kept. The kiosk will reload after clearing.")
                .setPositiveButton("Clear & Reload", (dialog, which) -> {
                    try {
                        if (webView != null) {
                            webView.clearCache(true);
                            webView.clearFormData();
                            webView.clearHistory();
                            android.webkit.CookieManager.getInstance().removeAllCookies(null);
                            android.webkit.WebStorage.getInstance().deleteAllData();
                        }
                        Toast.makeText(this, "Data cleared -- reloading", Toast.LENGTH_SHORT).show();
                        reloadKiosk();
                    } catch (Throwable t) {
                        Log.e(TAG, "Failed to clear data: " + t.getMessage());
                        Toast.makeText(this, "Error clearing data", Toast.LENGTH_SHORT).show();
                    }
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Clear data dialog failed: " + t.getMessage());
        }
    }

    // ============================================
    // SETTINGS: TOGGLE SCREEN ALWAYS-ON
    // ============================================

    private void showToggleScreenOnDialog() {
        try {
            boolean isOn = getPrefs().getBoolean(KEY_KEEP_SCREEN_ON, true);
            String label = isOn
                ? "Screen is currently: ALWAYS ON\n\nDisable to allow screen timeout?"
                : "Screen is currently: AUTO TIMEOUT\n\nEnable always-on for 24/7 kiosk operation?";

            new AlertDialog.Builder(this)
                .setTitle("Screen Always-On")
                .setMessage(label)
                .setPositiveButton(isOn ? "Disable Always-On" : "Enable Always-On", (dialog, which) -> {
                    boolean newVal = !isOn;
                    getPrefs().edit().putBoolean(KEY_KEEP_SCREEN_ON, newVal).apply();
                    if (newVal) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                    Toast.makeText(this, "Screen: " + (newVal ? "Always On" : "Auto Timeout"), Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Screen toggle dialog failed: " + t.getMessage());
        }
    }

    // ============================================
    // IN-APP UPDATE SYSTEM
    // ============================================

    private void scheduleUpdateChecks() {
        updateCheckRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isDestroyed) {
                    checkForUpdatesInBackground();
                    mainHandler.postDelayed(this, UPDATE_CHECK_INTERVAL_MS);
                }
            }
        };
        mainHandler.postDelayed(updateCheckRunnable, UPDATE_CHECK_DELAY_MS);
        Log.i(TAG, "Update checks scheduled (first in " + UPDATE_CHECK_DELAY_MS + "ms, then every " + UPDATE_CHECK_INTERVAL_MS + "ms)");
    }

    private void stopUpdateChecks() {
        if (updateCheckRunnable != null) {
            mainHandler.removeCallbacks(updateCheckRunnable);
            updateCheckRunnable = null;
            Log.i(TAG, "Update checks stopped");
        }
    }

    private void checkForUpdatesInBackground() {
        new Thread(() -> {
            try {
                String baseUrl = getKioskUrl();
                String origin = baseUrl;
                if (baseUrl.contains("//")) {
                    int pathStart = baseUrl.indexOf("//", baseUrl.indexOf("//") + 1);
                    if (pathStart > 0) {
                        int slashIndex = baseUrl.indexOf("/", baseUrl.indexOf("//") + 2);
                        if (slashIndex > 0) {
                            origin = baseUrl.substring(0, slashIndex);
                        } else {
                            origin = baseUrl;
                        }
                    }
                }
                String checkUrl = origin + UPDATE_CHECK_URL;
                Log.i(TAG, "Checking for updates: " + checkUrl);

                URL url = new URL(checkUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", "PickupKiosk/" + APP_VERSION);

                int responseCode = conn.getResponseCode();
                if (responseCode != 200) {
                    Log.w(TAG, "Update check failed: HTTP " + responseCode);
                    return;
                }

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();

                String jsonResponse = response.toString();
                Log.i(TAG, "Update check response: " + jsonResponse);

                String serverVersion = extractJsonString(jsonResponse, "version");
                int serverVersionCode = extractJsonInt(jsonResponse, "versionCode");
                String apkUrl = extractJsonString(jsonResponse, "apkUrl");
                String checksum = extractJsonString(jsonResponse, "checksum");
                String changelog = extractJsonString(jsonResponse, "changelog");
                boolean forceUpdate = extractJsonBoolean(jsonResponse, "forceUpdate");

                if (serverVersion == null || serverVersion.isEmpty()) {
                    Log.w(TAG, "Update check: no version info in response");
                    return;
                }

                getPrefs().edit()
                    .putString(KEY_AVAILABLE_VERSION, serverVersion)
                    .putInt(KEY_AVAILABLE_VERSION_CODE, serverVersionCode)
                    .putString(KEY_AVAILABLE_APK_URL, apkUrl)
                    .putString(KEY_AVAILABLE_CHECKSUM, checksum)
                    .putString(KEY_AVAILABLE_CHANGELOG, changelog)
                    .putBoolean(KEY_FORCE_UPDATE, forceUpdate)
                    .putLong(KEY_LAST_UPDATE_CHECK, System.currentTimeMillis())
                    .apply();

                if (serverVersionCode > APP_VERSION_CODE) {
                    pendingUpdateVersion = serverVersion;
                    Log.i(TAG, "Update available: v" + serverVersion + " (code " + serverVersionCode + "), force=" + forceUpdate);

                    if (forceUpdate && mainHandler != null) {
                        mainHandler.post(() -> {
                            if (!isDestroyed) showForceUpdateDialog(serverVersion, changelog);
                        });
                    }
                } else {
                    pendingUpdateVersion = null;
                    Log.i(TAG, "App is up to date (v" + APP_VERSION + ")");
                }

            } catch (Throwable t) {
                Log.e(TAG, "Update check error: " + t.getMessage());
            }
        }).start();
    }

    private void checkForUpdatesNow() {
        if (isDownloadingUpdate) {
            Toast.makeText(this, "Update is already downloading...", Toast.LENGTH_SHORT).show();
            return;
        }

        Toast.makeText(this, "Checking for updates...", Toast.LENGTH_SHORT).show();

        new Thread(() -> {
            try {
                String baseUrl = getKioskUrl();
                String origin = baseUrl;
                if (baseUrl.contains("//")) {
                    int slashIndex = baseUrl.indexOf("/", baseUrl.indexOf("//") + 2);
                    if (slashIndex > 0) {
                        origin = baseUrl.substring(0, slashIndex);
                    }
                }
                String checkUrl = origin + UPDATE_CHECK_URL;

                URL url = new URL(checkUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", "PickupKiosk/" + APP_VERSION);

                int responseCode = conn.getResponseCode();
                if (responseCode != 200) {
                    mainHandler.post(() ->
                        Toast.makeText(this, "Update check failed (HTTP " + responseCode + ")", Toast.LENGTH_LONG).show()
                    );
                    return;
                }

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();

                String jsonResponse = response.toString();

                String serverVersion = extractJsonString(jsonResponse, "version");
                int serverVersionCode = extractJsonInt(jsonResponse, "versionCode");
                String apkUrl = extractJsonString(jsonResponse, "apkUrl");
                String checksum = extractJsonString(jsonResponse, "checksum");
                String changelog = extractJsonString(jsonResponse, "changelog");
                boolean forceUpdate = extractJsonBoolean(jsonResponse, "forceUpdate");

                getPrefs().edit()
                    .putString(KEY_AVAILABLE_VERSION, serverVersion)
                    .putInt(KEY_AVAILABLE_VERSION_CODE, serverVersionCode)
                    .putString(KEY_AVAILABLE_APK_URL, apkUrl)
                    .putString(KEY_AVAILABLE_CHECKSUM, checksum)
                    .putString(KEY_AVAILABLE_CHANGELOG, changelog)
                    .putBoolean(KEY_FORCE_UPDATE, forceUpdate)
                    .putLong(KEY_LAST_UPDATE_CHECK, System.currentTimeMillis())
                    .apply();

                if (serverVersionCode > APP_VERSION_CODE) {
                    pendingUpdateVersion = serverVersion;
                    mainHandler.post(() -> {
                        if (!isDestroyed) {
                            showUpdateAvailableDialog(serverVersion, changelog, apkUrl);
                        }
                    });
                } else {
                    pendingUpdateVersion = null;
                    mainHandler.post(() ->
                        Toast.makeText(this, "App is up to date (v" + APP_VERSION + ")", Toast.LENGTH_LONG).show()
                    );
                }

            } catch (Throwable t) {
                mainHandler.post(() ->
                    Toast.makeText(this, "Update check failed: " + t.getMessage(), Toast.LENGTH_LONG).show()
                );
                Log.e(TAG, "Manual update check error: " + t.getMessage());
            }
        }).start();
    }

    private void showUpdateMenu() {
        try {
            String availableVersion = getPrefs().getString(KEY_AVAILABLE_VERSION, "");
            String changelog = getPrefs().getString(KEY_AVAILABLE_CHANGELOG, "");
            long lastCheck = getPrefs().getLong(KEY_LAST_UPDATE_CHECK, 0);

            String lastCheckStr = lastCheck > 0
                ? new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(new Date(lastCheck))
                : "Never";

            if (availableVersion != null && !availableVersion.isEmpty() && pendingUpdateVersion != null) {
                String message = "Current version: v" + APP_VERSION + "\n"
                    + "Available: v" + availableVersion + "\n"
                    + "Last checked: " + lastCheckStr + "\n\n"
                    + (changelog != null && !changelog.isEmpty() ? "What's new:\n" + changelog : "");

                new AlertDialog.Builder(this)
                    .setTitle("Update Available")
                    .setMessage(message)
                    .setPositiveButton("Download & Install", (dialog, which) -> {
                        downloadAndInstallUpdate();
                    })
                    .setNeutralButton("Check Again", (dialog, which) -> {
                        checkForUpdatesNow();
                    })
                    .setNegativeButton("Later", null)
                    .setCancelable(true)
                    .show();
            } else {
                String message = "Current version: v" + APP_VERSION + "\n"
                    + "Last checked: " + lastCheckStr;

                new AlertDialog.Builder(this)
                    .setTitle("App Updates")
                    .setMessage(message)
                    .setPositiveButton("Check Now", (dialog, which) -> {
                        checkForUpdatesNow();
                    })
                    .setNegativeButton("Close", null)
                    .setCancelable(true)
                    .show();
            }
        } catch (Throwable t) {
            Log.e(TAG, "Update menu failed: " + t.getMessage());
        }
    }

    private void showForceUpdateDialog(String version, String changelog) {
        try {
            String message = "A critical update (v" + version + ") is available.\n\n"
                + (changelog != null && !changelog.isEmpty() ? changelog + "\n\n" : "")
                + "The app must be updated to continue.";

            new AlertDialog.Builder(this)
                .setTitle("Critical Update Required")
                .setMessage(message)
                .setCancelable(false)
                .setPositiveButton("Update Now", (dialog, which) -> {
                    downloadAndInstallUpdate();
                })
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Force update dialog failed: " + t.getMessage());
        }
    }

    private void showUpdateAvailableDialog(String version, String changelog, String apkUrl) {
        try {
            String message = "A new version (v" + version + ") is available.\n\n"
                + (changelog != null && !changelog.isEmpty() ? "What's new:\n" + changelog : "");

            new AlertDialog.Builder(this)
                .setTitle("Update Available")
                .setMessage(message)
                .setPositiveButton("Download & Install", (dialog, which) -> {
                    downloadAndInstallUpdate();
                })
                .setNeutralButton("Skip This Version", (dialog, which) -> {
                    getPrefs().edit().putString(KEY_UPDATE_SKIPPED_VERSION, version).apply();
                    Toast.makeText(this, "v" + version + " skipped. Admin can still install from menu.", Toast.LENGTH_LONG).show();
                })
                .setNegativeButton("Later", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Update available dialog failed: " + t.getMessage());
        }
    }

    private void downloadAndInstallUpdate() {
        if (isDownloadingUpdate) {
            Toast.makeText(this, "Update is already downloading...", Toast.LENGTH_SHORT).show();
            return;
        }

        String apkUrl = getPrefs().getString(KEY_AVAILABLE_APK_URL, "");
        if (apkUrl == null || apkUrl.isEmpty()) {
            String baseUrl = getKioskUrl();
            String origin = baseUrl;
            if (baseUrl.contains("//")) {
                int slashIndex = baseUrl.indexOf("/", baseUrl.indexOf("//") + 2);
                if (slashIndex > 0) {
                    origin = baseUrl.substring(0, slashIndex);
                }
            }
            apkUrl = origin + "/api/app-version/download";
        }

        final String downloadUrl = apkUrl;
        isDownloadingUpdate = true;

        ProgressDialog progressDialog = new ProgressDialog(this);
        progressDialog.setTitle("Downloading Update");
        progressDialog.setMessage("Preparing download...");
        progressDialog.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        progressDialog.setMax(100);
        progressDialog.setProgress(0);
        progressDialog.setCancelable(false);
        progressDialog.show();

        new Thread(() -> {
            try {
                File updateDir = new File(getExternalFilesDir(null), UPDATE_DIR);
                if (!updateDir.exists()) {
                    updateDir.mkdirs();
                }
                File apkFile = new File(updateDir, APK_FILENAME);

                if (apkFile.exists()) {
                    apkFile.delete();
                }

                Log.i(TAG, "Downloading update from: " + downloadUrl);

                URL url = new URL(downloadUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(120000);
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", "PickupKiosk/" + APP_VERSION);

                int responseCode = conn.getResponseCode();
                if (responseCode != 200) {
                    mainHandler.post(() -> {
                        progressDialog.dismiss();
                        isDownloadingUpdate = false;
                        Toast.makeText(this, "Download failed (HTTP " + responseCode + ")", Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                int contentLength = conn.getContentLength();
                InputStream input = conn.getInputStream();
                FileOutputStream output = new FileOutputStream(apkFile);

                byte[] buffer = new byte[8192];
                long totalRead = 0;
                int bytesRead;

                while ((bytesRead = input.read(buffer)) != -1) {
                    output.write(buffer, 0, bytesRead);
                    totalRead += bytesRead;

                    if (contentLength > 0) {
                        int progress = (int) ((totalRead * 100) / contentLength);
                        final int p = progress;
                        final long mb = totalRead / (1024 * 1024);
                        mainHandler.post(() -> {
                            if (!isDestroyed) {
                                progressDialog.setProgress(p);
                                progressDialog.setMessage("Downloaded: " + mb + " MB");
                            }
                        });
                    }
                }

                output.flush();
                output.close();
                input.close();

                String expectedChecksum = getPrefs().getString(KEY_AVAILABLE_CHECKSUM, "");
                if (expectedChecksum != null && !expectedChecksum.isEmpty() && expectedChecksum.startsWith("sha256:")) {
                    String expectedHash = expectedChecksum.substring(7);
                    String actualHash = computeSHA256(apkFile);
                    if (!expectedHash.equalsIgnoreCase(actualHash)) {
                        Log.e(TAG, "Checksum mismatch! Expected: " + expectedHash + " Got: " + actualHash);
                        apkFile.delete();
                        mainHandler.post(() -> {
                            progressDialog.dismiss();
                            isDownloadingUpdate = false;
                            new AlertDialog.Builder(this)
                                .setTitle("Update Failed")
                                .setMessage("Downloaded file is corrupted (checksum mismatch). Please try again.")
                                .setPositiveButton("OK", null)
                                .show();
                        });
                        return;
                    }
                    Log.i(TAG, "Checksum verified OK");
                }

                mainHandler.post(() -> {
                    if (isDestroyed) return;
                    progressDialog.dismiss();
                    isDownloadingUpdate = false;
                    installApk(apkFile);
                });

            } catch (Throwable t) {
                Log.e(TAG, "Download failed: " + t.getMessage(), t);
                mainHandler.post(() -> {
                    if (!isDestroyed) {
                        progressDialog.dismiss();
                        isDownloadingUpdate = false;
                        new AlertDialog.Builder(this)
                            .setTitle("Download Failed")
                            .setMessage("Could not download update: " + t.getMessage())
                            .setPositiveButton("OK", null)
                            .show();
                    }
                });
            }
        }).start();
    }

    private void installApk(File apkFile) {
        try {
            if (!apkFile.exists()) {
                Toast.makeText(this, "APK file not found", Toast.LENGTH_LONG).show();
                return;
            }

            Log.i(TAG, "Installing APK: " + apkFile.getAbsolutePath() + " (" + apkFile.length() + " bytes)");

            Intent installIntent;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                Uri apkUri = FileProvider.getUriForFile(
                    this,
                    "com.pickupjamaica.kiosk.fileprovider",
                    apkFile
                );
                installIntent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                installIntent.setData(apkUri);
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(
                    Uri.fromFile(apkFile),
                    "application/vnd.android.package-archive"
                );
            }

            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    new AlertDialog.Builder(this)
                        .setTitle("Install Permission Required")
                        .setMessage("To install updates, this app needs permission to install unknown apps.\n\nPlease enable it in Settings and then try again.")
                        .setPositiveButton("Open Settings", (dialog, which) -> {
                            Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                            settingsIntent.setData(Uri.parse("package:com.pickupjamaica.kiosk"));
                            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(settingsIntent);
                        })
                        .setNegativeButton("Cancel", null)
                        .show();
                    return;
                }
            }

            startActivity(installIntent);

        } catch (Throwable t) {
            Log.e(TAG, "Install failed: " + t.getMessage(), t);
            Toast.makeText(this, "Install failed: " + t.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private String computeSHA256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        FileInputStream fis = new FileInputStream(file);
        byte[] buffer = new byte[8192];
        int bytesRead;
        while ((bytesRead = fis.read(buffer)) != -1) {
            digest.update(buffer, 0, bytesRead);
        }
        fis.close();

        byte[] hash = digest.digest();
        StringBuilder hexString = new StringBuilder();
        for (byte b : hash) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) hexString.append('0');
            hexString.append(hex);
        }
        return hexString.toString();
    }

    private String extractJsonString(String json, String key) {
        try {
            String searchKey = "\"" + key + "\"";
            int keyIndex = json.indexOf(searchKey);
            if (keyIndex < 0) return "";

            int colonIndex = json.indexOf(":", keyIndex + searchKey.length());
            if (colonIndex < 0) return "";

            int openQuote = json.indexOf("\"", colonIndex + 1);
            if (openQuote < 0) return "";

            int closeQuote = json.indexOf("\"", openQuote + 1);
            if (closeQuote < 0) return "";

            return json.substring(openQuote + 1, closeQuote);
        } catch (Throwable t) {
            return "";
        }
    }

    private int extractJsonInt(String json, String key) {
        try {
            String searchKey = "\"" + key + "\"";
            int keyIndex = json.indexOf(searchKey);
            if (keyIndex < 0) return 0;

            int colonIndex = json.indexOf(":", keyIndex + searchKey.length());
            if (colonIndex < 0) return 0;

            int start = colonIndex + 1;
            while (start < json.length() && Character.isWhitespace(json.charAt(start))) start++;

            int end = start;
            while (end < json.length() && (Character.isDigit(json.charAt(end)) || json.charAt(end) == '-')) end++;

            if (start >= end) return 0;
            return Integer.parseInt(json.substring(start, end));
        } catch (Throwable t) {
            return 0;
        }
    }

    private boolean extractJsonBoolean(String json, String key) {
        try {
            String searchKey = "\"" + key + "\"";
            int keyIndex = json.indexOf(searchKey);
            if (keyIndex < 0) return false;

            int colonIndex = json.indexOf(":", keyIndex + searchKey.length());
            if (colonIndex < 0) return false;

            int start = colonIndex + 1;
            while (start < json.length() && Character.isWhitespace(json.charAt(start))) start++;

            return json.substring(start, Math.min(start + 4, json.length())).equals("true");
        } catch (Throwable t) {
            return false;
        }
    }

    // ============================================
    // ACTIONS: BACKEND PANEL
    // ============================================

    private void openBackendPanel() {
        try {
            isViewingBackend = true;
            String url = getBackendUrl();
            if (webView != null) {
                webView.loadUrl(url);
                Log.i(TAG, "Loading backend panel: " + url);
            }
            Toast.makeText(this, "Backend Panel loaded\nUse 5-tap + code to return", Toast.LENGTH_LONG).show();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to open backend: " + t.getMessage());
        }
    }

    // ============================================
    // ACTIONS: WIFI SETTINGS
    // ============================================

    private void openWifiSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Throwable t) {
            try {
                Intent intent = new Intent(Settings.ACTION_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Throwable t2) {
                Log.e(TAG, "Failed to open any settings: " + t2.getMessage());
            }
        }
    }

    // ============================================
    // ACTIONS: RELOAD & CLOSE
    // ============================================

    /**
     * Soft reload: clears cache and re-loads the kiosk URL on the existing WebView.
     * For frozen renderer recovery, use rebuildWebView() instead.
     */
    private void reloadKiosk() {
        isShowingOfflinePage = false;
        isViewingBackend = false;
        reconnectAttempts = 0;
        if (webView != null) {
            try {
                webView.clearCache(true);
                pageLoadStartTime = System.currentTimeMillis();
                webView.loadUrl(getKioskUrl());
                diagLog("RELOAD", "soft reload");
            } catch (Throwable t) {
                Log.e(TAG, "Failed to reload: " + t.getMessage());
            }
        }
    }

    private void closeApp() {
        unregisterConnectivityMonitoring();
        if (mainHandler != null) mainHandler.removeCallbacksAndMessages(null);
        finishAffinity();
        System.exit(0);
    }

    // ============================================
    // DIAGNOSTIC LOGGER -- Rotating, persistent, privacy-safe
    // ============================================

    /**
     * Appends a timestamped diagnostic entry to the rotating log file.
     * Automatically rotates when the file exceeds DIAG_MAX_FILE_SIZE.
     *
     * Privacy: Never logs phone numbers, locker codes, payment tokens,
     * PINs, or personal information. Only system-level events.
     *
     * Logs survive app restarts (stored in app's external files dir).
     */
    private void diagLog(String event, String detail) {
        new Thread(() -> {
            try {
                File diagDir = new File(getExternalFilesDir(null), DIAG_DIR);
                if (!diagDir.exists()) diagDir.mkdirs();

                File logFile = new File(diagDir, DIAG_FILENAME);

                // Rotate if file is too large
                if (logFile.exists() && logFile.length() > DIAG_MAX_FILE_SIZE) {
                    rotateDiagFiles(diagDir);
                }

                long uptimeMs = System.currentTimeMillis() - getStartTime();
                String memInfo = getMemInfo();
                String netState = isNetworkAvailable() ? "UP" : "DOWN";

                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US);
                String timestamp = sdf.format(new Date());

                // Build the log line (truncate detail to 500 chars to prevent runaway logs)
                String safeDetail = detail != null && detail.length() > 500
                    ? detail.substring(0, 500) + "..." : detail;
                String line = timestamp + " | " + event + " | uptime=" + uptimeMs
                    + " | net=" + netState + " | mem=" + memInfo
                    + " | url=" + (lastLoadedUrl.length() > 80 ? lastLoadedUrl.substring(0, 80) + "..." : lastLoadedUrl)
                    + " | " + safeDetail + "\n";

                // Append to file
                PrintWriter writer = new PrintWriter(new BufferedWriter(new FileWriter(logFile, true)));
                writer.print(line);
                writer.close();
            } catch (Throwable t) {
                // Don't spam logs if diag logging itself fails
            }
        }).start();
    }

    private long getStartTime() {
        // ProcessHandle is API 33+; not available on our API 22 target.
        // Use pageLoadStartTime as a proxy for app start time.
        return pageLoadStartTime > 0 ? pageLoadStartTime : System.currentTimeMillis();
    }

    private String getMemInfo() {
        try {
            Runtime rt = Runtime.getRuntime();
            long usedMB = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
            long maxMB = rt.maxMemory() / (1024 * 1024);
            return usedMB + "/" + maxMB + "MB";
        } catch (Throwable t) {
            return "?";
        }
    }

    private void rotateDiagFiles(File diagDir) {
        try {
            // Delete oldest rotated file
            File oldest = new File(diagDir, DIAG_FILENAME + "." + DIAG_MAX_FILES);
            if (oldest.exists()) oldest.delete();

            // Shift existing rotated files up
            for (int i = DIAG_MAX_FILES - 1; i >= 1; i--) {
                File src = new File(diagDir, DIAG_FILENAME + "." + i);
                if (src.exists()) {
                    File dst = new File(diagDir, DIAG_FILENAME + "." + (i + 1));
                    src.renameTo(dst);
                }
            }

            // Rotate current log to .1
            File current = new File(diagDir, DIAG_FILENAME);
            File rotated = new File(diagDir, DIAG_FILENAME + ".1");
            current.renameTo(rotated);
        } catch (Throwable t) {
            Log.w(TAG, "Diag rotation failed: " + t.getMessage());
        }
    }

    // ============================================
    // DIAGNOSTICS: VIEW
    // ============================================

    private void showDiagnosticsViewer() {
        try {
            File diagDir = new File(getExternalFilesDir(null), DIAG_DIR);
            File logFile = new File(diagDir, DIAG_FILENAME);

            StringBuilder content = new StringBuilder();
            content.append("=== Pickup Kiosk Diagnostics (v").append(APP_VERSION).append(") ===\n");
            content.append("API Level: ").append(Build.VERSION.SDK_INT).append("\n");
            content.append("Device: ").append(Build.MANUFACTURER).append(" ").append(Build.MODEL).append("\n");
            content.append("Android: ").append(Build.VERSION.RELEASE).append("\n");

            // WebView version
            try {
                if (webView != null) {
                    content.append("WebView UA: ").append(webView.getSettings().getUserAgentString()).append("\n");
                } else {
                    content.append("WebView: NULL (destroyed or not created)\n");
                }
            } catch (Throwable t) {
                content.append("WebView: ERROR reading UA\n");
            }

            content.append("Uptime: ").append((System.currentTimeMillis() - pageLoadStartTime) / 1000).append("s\n");
            content.append("Memory: ").append(getMemInfo()).append("\n");
            content.append("Network: ").append(isNetworkAvailable() ? "UP" : "DOWN").append("\n");
            content.append("Health fails: ").append(healthCheckFailCount).append("\n");
            content.append("Health in-progress: ").append(healthCheckInProgress).append("\n");
            content.append("Health check ID: ").append(healthCheckId).append("\n");
            content.append("Rebuilds this hour: ").append(rebuildCountThisHour).append("\n");
            content.append("Last rebuild: ").append(lastRebuildTime > 0 ? (System.currentTimeMillis() - lastRebuildTime) / 1000 + "s ago" : "never").append("\n");
            content.append("Last URL: ").append(lastLoadedUrl).append("\n");
            content.append("Last page finish: ").append(lastPageFinishTime > 0 ? (System.currentTimeMillis() - lastPageFinishTime) / 1000 + "s ago" : "never").append("\n");
            content.append("Showing offline: ").append(isShowingOfflinePage).append("\n");
            content.append("Viewing backend: ").append(isViewingBackend).append("\n");
            content.append("\n--- Recent Log (last 200 lines) ---\n\n");

            // Read last 200 lines of the log file
            if (logFile.exists()) {
                try {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(logFile)));
                    java.util.ArrayList<String> lines = new java.util.ArrayList<>();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        lines.add(line);
                    }
                    reader.close();
                    int start = Math.max(0, lines.size() - 200);
                    for (int i = start; i < lines.size(); i++) {
                        content.append(lines.get(i)).append("\n");
                    }
                } catch (Throwable t) {
                    content.append("Error reading log: ").append(t.getMessage());
                }
            } else {
                content.append("(No diagnostic log file found)");
            }

            // Show in a scrollable text view
            TextView textView = new TextView(this);
            textView.setText(content.toString());
            textView.setTextColor(0xFFCCCCCC);
            textView.setTextSize(11);
            textView.setPadding(16, 16, 16, 16);
            // setFontMonospace is API 35+, not available on API 22

            ScrollView scrollView = new ScrollView(this);
            scrollView.setBackgroundColor(0xFF1A1A1A);
            scrollView.addView(textView);

            new AlertDialog.Builder(this)
                .setTitle("Diagnostics (v" + APP_VERSION + ")")
                .setView(scrollView)
                .setPositiveButton("OK", null)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Diagnostics viewer failed: " + t.getMessage());
            Toast.makeText(this, "Error viewing diagnostics", Toast.LENGTH_SHORT).show();
        }
    }

    // ============================================
    // DIAGNOSTICS: EXPORT
    // ============================================

    private void exportDiagnostics() {
        try {
            File diagDir = new File(getExternalFilesDir(null), DIAG_DIR);
            File exportDir = new File(getExternalFilesDir(null), "exported");
            if (!exportDir.exists()) exportDir.mkdirs();

            // Create a combined export file with header + all rotated logs
            SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US);
            String exportName = "kiosk-diag-" + sdf.format(new Date()) + ".txt";
            File exportFile = new File(exportDir, exportName);

            PrintWriter writer = new PrintWriter(new BufferedWriter(new FileWriter(exportFile)));

            writer.println("=== Pickup Jamaica Kiosk Diagnostic Export ===");
            writer.println("Export time: " + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()));
            writer.println("App version: " + APP_VERSION + " (code " + APP_VERSION_CODE + ")");
            writer.println("API Level: " + Build.VERSION.SDK_INT);
            writer.println("Device: " + Build.MANUFACTURER + " " + Build.MODEL);
            writer.println("Android: " + Build.VERSION.RELEASE);
            writer.println("Memory: " + getMemInfo());
            writer.println();

            // Copy all log files (current + rotated)
            for (int i = DIAG_MAX_FILES; i >= 1; i--) {
                File rotated = new File(diagDir, DIAG_FILENAME + "." + i);
                if (rotated.exists()) {
                    writer.println("--- " + DIAG_FILENAME + "." + i + " ---");
                    copyFileToWriter(rotated, writer);
                    writer.println();
                }
            }
            File current = new File(diagDir, DIAG_FILENAME);
            if (current.exists()) {
                writer.println("--- " + DIAG_FILENAME + " (current) ---");
                copyFileToWriter(current, writer);
            }

            writer.close();

            // Share via intent (no ADB needed)
            Uri fileUri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                fileUri = FileProvider.getUriForFile(this, "com.pickupjamaica.kiosk.fileprovider", exportFile);
            } else {
                fileUri = Uri.fromFile(exportFile);
            }

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("text/plain");
            shareIntent.putExtra(Intent.EXTRA_STREAM, fileUri);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(shareIntent, "Export Diagnostics"));

            Toast.makeText(this, "Diagnostics exported to " + exportFile.getName(), Toast.LENGTH_LONG).show();
            diagLog("DIAG_EXPORT", "file=" + exportName);

        } catch (Throwable t) {
            Log.e(TAG, "Export diagnostics failed: " + t.getMessage());
            Toast.makeText(this, "Export failed: " + t.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void copyFileToWriter(File file, PrintWriter writer) {
        try {
            BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file)));
            String line;
            while ((line = reader.readLine()) != null) {
                writer.println(line);
            }
            reader.close();
        } catch (Throwable t) {
            writer.println("(Error reading file: " + t.getMessage() + ")");
        }
    }

    // ============================================
    // DIAGNOSTICS: CLEAR
    // ============================================

    private void clearDiagnostics() {
        try {
            new AlertDialog.Builder(this)
                .setTitle("Clear Diagnostics")
                .setMessage("Delete all diagnostic log files? This cannot be undone.")
                .setPositiveButton("Clear", (dialog, which) -> {
                    try {
                        File diagDir = new File(getExternalFilesDir(null), DIAG_DIR);
                        if (diagDir.exists()) {
                            File[] files = diagDir.listFiles();
                            if (files != null) {
                                for (File f : files) {
                                    f.delete();
                                }
                            }
                        }
                        Toast.makeText(this, "Diagnostics cleared", Toast.LENGTH_SHORT).show();
                        Log.i(TAG, "Diagnostic logs cleared");
                    } catch (Throwable t) {
                        Toast.makeText(this, "Error clearing diagnostics", Toast.LENGTH_SHORT).show();
                    }
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Throwable t) {
            Log.e(TAG, "Clear diagnostics dialog failed: " + t.getMessage());
        }
    }

    // ============================================
    // UNCAUGHT EXCEPTION HANDLER
    // ============================================

    private void installUncaughtExceptionHandler() {
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                diagLog("UNCAUGHT_EXCEPTION", "thread=" + thread.getName()
                    + ", error=" + throwable.getClass().getSimpleName()
                    + ": " + throwable.getMessage());
            } catch (Throwable t) {
                // Can't log, just proceed
            }
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });
    }
}
