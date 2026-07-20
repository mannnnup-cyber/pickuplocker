package com.pickupjamaica.kiosk;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import javax.net.ssl.SSLContext;

/**
 * Pickup Jamaica Kiosk — Bare WebView Activity v3.0
 *
 * Two-tier security: Staff PIN (basic access) vs Admin PIN (full access).
 * Settings are persisted via SharedPreferences.
 *
 * Access Levels:
 *   Staff PIN → basic menu (WiFi, orientation, brightness, reload, close)
 *   Admin PIN → full menu (backend, server URL, change PINs, clear data + all staff options)
 *
 * The PIN dialog shows "Device Code" — no hint about admin access exists in the UI.
 * Staff never sees admin options. Admin access is invisible.
 *
 * Security: 3 wrong PIN attempts = 5 minute lockout.
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "PickupKiosk";
    private static final String APP_VERSION = "3.2";

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

    // WebView health monitoring — detects frozen/white screens at the native level
    private static final int HEALTH_CHECK_INTERVAL_MS = 60000;   // 1 minute
    private static final int HEALTH_RELOAD_THRESHOLD = 2;        // After 2 failed checks, force reload (2 min total)

    // SharedPreferences keys
    private static final String PREFS_NAME = "pickup_kiosk_prefs";
    private static final String KEY_STAFF_PIN = "staff_pin";
    private static final String KEY_ADMIN_PIN = "admin_pin";
    private static final String KEY_ORIENTATION = "orientation";     // portrait / landscape / auto
    private static final String KEY_SERVER_URL = "server_url";
    private static final String KEY_BACKEND_URL = "backend_url";
    private static final String KEY_KEEP_SCREEN_ON = "keep_screen_on";
    private static final String KEY_PIN_FAILED_ATTEMPTS = "pin_failed_attempts";
    private static final String KEY_PIN_LOCKOUT_UNTIL = "pin_lockout_until";
    private static final String KEY_BRIGHTNESS = "brightness";       // 0-255, -1 = system default

    // Defaults
    private static final String DEFAULT_STAFF_PIN = "1111";
    private static final String DEFAULT_ADMIN_PIN = "1234";
    private static final String DEFAULT_ORIENTATION = "portrait";

    // State
    private WebView webView;
    private Handler mainHandler;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean isShowingOfflinePage = false;
    private boolean isViewingBackend = false;
    private int reconnectAttempts = 0;
    private boolean isDestroyed = false;
    private int secretTapCount = 0;
    private long lastSecretTapTime = 0;
    private int healthCheckFailCount = 0;
    private Runnable healthCheckRunnable;

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

            Log.i(TAG, "Kiosk v" + APP_VERSION + " started — loading " + getKioskUrl());
        } catch (Throwable t) {
            Log.e(TAG, "FATAL: onCreate — " + t.getClass().getSimpleName() + ": " + t.getMessage(), t);
            showErrorScreen("App failed to start: " + t.getClass().getSimpleName() + " — " + t.getMessage());
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
        unregisterConnectivityMonitoring();
        if (mainHandler != null) mainHandler.removeCallbacksAndMessages(null);
        if (webView != null) {
            try {
                webView.stopLoading();
                webView.loadUrl("about:blank");
                webView.clearCache(true);
                webView.destroy();
            } catch (Throwable t) { Log.w(TAG, "Error destroying WebView: " + t.getMessage()); }
            webView = null;
        }
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
    // TLS 1.2 — Critical for Android 5.1
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
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (url == null) return;
            if (OFFLINE_URL.equals(url)) {
                isShowingOfflinePage = true;
                Log.w(TAG, "Showing offline page");
            } else {
                isShowingOfflinePage = false;
                reconnectAttempts = 0;
                healthCheckFailCount = 0; // Reset health on successful page load
                Log.i(TAG, "Page loaded: " + url);
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request != null && request.isForMainFrame()) {
                if (!isShowingOfflinePage) showOfflinePage();
            }
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            if (!isShowingOfflinePage) showOfflinePage();
        }

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
         * CRITICAL: Called when the WebView renderer process crashes (OOM kill, etc.)
         * This is the #1 cause of white screens — Android kills the renderer but
         * the Activity is still alive. Without this handler, the WebView shows blank.
         * Available from API 26 (Android 8.0), which covers our target devices.
         */
        @Override
        public boolean onRenderProcessGone(WebView view, int detail) {
            Log.e(TAG, "WebView renderer process GONE! Detail: " + detail
                + " (0=crash, 1=OOM killed). Rebuilding WebView immediately.");

            if (isDestroyed) return true;

            // Destroy the old WebView completely
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
                    Log.e(TAG, "Error destroying dead WebView: " + t.getMessage());
                }
                webView = null;
            }

            // Rebuild a fresh WebView
            mainHandler.post(() -> {
                if (isDestroyed) return;
                try {
                    webView = createWebViewSafely();
                    if (webView != null) {
                        setContentView(webView);
                        hideSystemUI();
                        configureWebView();
                        webView.loadUrl(getKioskUrl());
                        isShowingOfflinePage = false;
                        reconnectAttempts = 0;
                        healthCheckFailCount = 0;
                        Log.i(TAG, "WebView rebuilt after renderer crash — kiosk reloaded");
                    } else {
                        showErrorScreen("WebView failed to restart. Please reboot the device.");
                    }
                } catch (Throwable t) {
                    Log.e(TAG, "Failed to rebuild WebView: " + t.getMessage());
                    showErrorScreen("Critical error. Please reboot the device.");
                }
            });

            return true; // We handled it — don't let WebView do its default (which does nothing)
        }
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
    // CONNECTIVITY MONITORING
    // ============================================

    private void registerConnectivityMonitoring() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return;
            NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
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
                public void onLost(Network network) { Log.w(TAG, "Network lost"); }
                @Override
                public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                    if (caps == null) return;
                    boolean ok = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                            && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                    if (ok && isShowingOfflinePage && mainHandler != null) {
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
            cm.registerNetworkCallback(request, networkCallback);
        } catch (Throwable t) {
            Log.e(TAG, "Network monitoring failed: " + t.getMessage());
        }
    }

    private void unregisterConnectivityMonitoring() {
        if (networkCallback != null) {
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) cm.unregisterNetworkCallback(networkCallback);
            } catch (Throwable t) { Log.w(TAG, t.getMessage()); }
        }
    }

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network activeNetwork = cm.getActiveNetwork();
            if (activeNetwork == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Throwable t) { return true; }
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
                if (!isDestroyed) {
                    checkWebViewHealth();
                    mainHandler.postDelayed(this, HEALTH_CHECK_INTERVAL_MS);
                }
            }
        };
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
     * force a reload to recover from white screen issues.
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            webView.evaluateJavascript("(function(){ try { var c = document.querySelector('.container'); return c ? 'ok' : 'empty'; } catch(e) { return 'error'; } })()", new android.webkit.ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if (value != null && (value.contains("ok") || value.contains("empty"))) {
                        if (value.contains("empty")) {
                            healthCheckFailCount++;
                            Log.w(TAG, "Health check: Page content empty (fail " + healthCheckFailCount + "/" + HEALTH_RELOAD_THRESHOLD + ")");
                        } else {
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
            // Pre-KitKat: just check offline status
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
    // BACK BUTTON
    // ============================================

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        }
    }

    // ============================================
    // SECRET TRIGGER — 5-tap top-left corner
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

    /**
     * PIN entry dialog — titled "Device Code" (no hint about admin).
     * Staff PIN → staff menu. Admin PIN → admin menu.
     * 3 wrong attempts → 5 minute lockout.
     */
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
                        // Admin access — reset failed attempts
                        resetPinAttempts();
                        Log.i(TAG, "Admin access granted");
                        showAdminMenu();
                    } else if (entered.equals(getStaffPin())) {
                        // Staff access — reset failed attempts
                        resetPinAttempts();
                        Log.i(TAG, "Staff access granted");
                        showStaffMenu();
                    } else {
                        // Wrong PIN
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
            // Lock out for 5 minutes
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
    // STAFF MENU — Basic access only
    // ============================================

    private void showStaffMenu() {
        try {
            String[] options = {
                "WiFi Settings",
                "Screen Orientation",
                "Screen Brightness",
                "Reload Kiosk",
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
                        case 4: closeApp(); break;
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
    // ADMIN MENU — Full access
    // ============================================

    private void showAdminMenu() {
        try {
            String[] options = {
                "Open Backend Panel",
                "Change Server URL",
                "Change Device Code (Staff)",
                "Change Admin Code",
                "Clear App Data & Cache",
                "WiFi Settings",
                "Screen Orientation",
                "Screen Brightness",
                "Toggle Screen Always-On",
                "Reload Kiosk",
                "Close App"
            };
            new AlertDialog.Builder(this)
                .setTitle("Admin Settings")
                .setItems(options, (dialog, which) -> {
                    switch (which) {
                        case 0: openBackendPanel(); break;
                        case 1: showChangeServerUrlDialog(); break;
                        case 2: showChangePinDialog("staff"); break;
                        case 3: showChangePinDialog("admin"); break;
                        case 4: showClearDataConfirmDialog(); break;
                        case 5: openWifiSettings(); break;
                        case 6: showOrientationDialog(); break;
                        case 7: showBrightnessDialog(); break;
                        case 8: showToggleScreenOnDialog(); break;
                        case 9: reloadKiosk(); break;
                        case 10: closeApp(); break;
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
            // If system default, estimate current brightness for the slider
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
                    // Don't allow staff and admin PINs to be the same
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
                        Toast.makeText(this, "Data cleared — reloading", Toast.LENGTH_SHORT).show();
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
            // Fallback to general settings
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

    private void reloadKiosk() {
        isShowingOfflinePage = false;
        isViewingBackend = false;
        reconnectAttempts = 0;
        if (webView != null) {
            try {
                webView.clearCache(true);
                webView.loadUrl(getKioskUrl());
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
}
