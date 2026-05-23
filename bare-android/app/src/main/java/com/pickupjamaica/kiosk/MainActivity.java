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
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import javax.net.ssl.SSLContext;

/**
 * Pickup Jamaica Kiosk — Bare WebView Activity
 *
 * No Capacitor dependency — pure Android WebView wrapper.
 * Targets Android 5.1 (API 22) with TLS 1.2 compatibility fix.
 * Compatible with modern Android (12-15+).
 *
 * Features:
 * - TLS 1.2 enablement for Android 5.1 (Vercel CDN requires it)
 * - Immersive sticky kiosk mode
 * - Branded offline page with auto-reconnect
 * - Connectivity monitoring with auto-reload
 * - Screen always-on for 24/7 operation
 * - Screenshot prevention (FLAG_SECURE)
 * - Landscape orientation lock
 * - Secret admin exit (5-tap top-left corner + PIN)
 * - Auto-start on boot (via BootReceiver)
 * - Crash protection with error screen
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "PickupKiosk";
    private static final String KIOSK_URL = "https://pickuplocker.vercel.app/kiosk-lite";
    private static final String OFFLINE_URL = "file:///android_asset/offline.html";
    private static final int RECONNECT_DELAY_MS = 5000;
    private static final int MAX_RECONNECT_ATTEMPTS = 60;
    private static final int CONNECTIVITY_CHECK_MS = 3000;

    private WebView webView;
    private Handler mainHandler = new Handler(Looper.getMainLooper());
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean isShowingOfflinePage = false;
    private int reconnectAttempts = 0;

    // Secret exit: tap top-left 5x within 3 seconds
    private static final int SECRET_TAP_COUNT = 5;
    private static final int SECRET_TAP_TIMEOUT_MS = 3000;
    private static final int SECRET_TAP_AREA_DP = 80;
    private int secretTapCount = 0;
    private long lastSecretTapTime = 0;

    // Admin PIN (change for production)
    private static final String ADMIN_EXIT_PIN = "1234";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        try {
            super.onCreate(savedInstanceState);

            // Keep screen on (24/7 kiosk)
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

            // Prevent screenshots / screen recording (payment security)
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            );

            // Enable TLS 1.2 on Android 5.x for Vercel CDN compatibility
            enableTLS12();

            // Create and configure WebView
            webView = new WebView(this);
            setContentView(webView);

            // Fullscreen immersive (after setContentView so decorView exists)
            hideSystemUI();

            // Configure the WebView
            configureWebView();

            // Register network connectivity monitoring
            registerConnectivityMonitoring();

        } catch (Exception e) {
            Log.e(TAG, "FATAL: onCreate crashed — " + e.getMessage(), e);
            showErrorScreen("App failed to start: " + e.getMessage());
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
        super.onDestroy();
        unregisterConnectivityMonitoring();
        mainHandler.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
    }

    // ============================================
    // ERROR SCREEN — Fallback if app crashes
    // ============================================

    private void showErrorScreen(String message) {
        try {
            LinearLayout layout = new LinearLayout(this);
            layout.setOrientation(LinearLayout.VERTICAL);
            layout.setPadding(40, 40, 40, 40);
            layout.setBackgroundColor(0xFF111111);

            TextView title = new TextView(this);
            title.setText("PICKUP");
            title.setTextColor(0xFFFFD439);
            title.setTextSize(36);
            title.setGravity(android.view.Gravity.CENTER);

            TextView errorMsg = new TextView(this);
            errorMsg.setText(message);
            errorMsg.setTextColor(0xFF999999);
            errorMsg.setTextSize(16);
            errorMsg.setGravity(android.view.Gravity.CENTER);
            errorMsg.setPadding(0, 30, 0, 0);

            layout.addView(title);
            layout.addView(errorMsg);
            setContentView(layout);
        } catch (Exception e2) {
            Log.e(TAG, "Even error screen failed: " + e2.getMessage());
        }
    }

    // ============================================
    // TLS 1.2 ENABLEMENT — Critical for Android 5.x
    // ============================================

    private void enableTLS12() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN
                && Build.VERSION.SDK_INT <= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                SSLContext sc = SSLContext.getInstance("TLSv1.2");
                sc.init(null, null, null);
                SSLContext.setDefault(sc);
                Log.i(TAG, "TLS 1.2 enabled for Android 5.x");
            } catch (Exception e) {
                Log.e(TAG, "Failed to enable TLS 1.2: " + e.getMessage());
            }
        }
    }

    // ============================================
    // IMMERSIVE MODE — Android 5.0 through 15+
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
        } catch (Exception e) {
            Log.w(TAG, "hideSystemUI failed: " + e.getMessage());
        }
    }

    // ============================================
    // WEBVIEW CONFIGURATION
    // ============================================

    private void configureWebView() {
        if (webView == null) {
            Log.e(TAG, "WebView is null — cannot configure");
            return;
        }

        WebSettings settings = webView.getSettings();

        // Core settings
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        // Mixed content (HTTP from HTTPS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Cache: network first, cache fallback
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Zoom: disabled for kiosk
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        // WebView debugging: only in debug builds
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        // Custom clients
        webView.setWebViewClient(new KioskWebViewClient());
        webView.setWebChromeClient(new KioskWebChromeClient());

        // Load the kiosk URL
        webView.loadUrl(KIOSK_URL);
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
            if (request.isForMainFrame()) {
                Log.e(TAG, "Main frame error (code " + error.getErrorCode() + ")");
                if (!isShowingOfflinePage) showOfflinePage();
            }
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            Log.e(TAG, "Legacy WebView error: " + description + " (code: " + errorCode + ")");
            if (!isShowingOfflinePage) showOfflinePage();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (url.startsWith("https://pickuplocker.vercel.app") ||
                url.startsWith("file:///android_asset/") ||
                url.startsWith("https://api.dimepay.app")) {
                return false;
            }
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
                    break;
            }
            return true;
        }
    }

    // ============================================
    // OFFLINE PAGE
    // ============================================

    private void showOfflinePage() {
        isShowingOfflinePage = true;
        if (webView != null) {
            mainHandler.post(() -> {
                if (webView != null) {
                    webView.loadUrl(OFFLINE_URL);
                    Log.i(TAG, "Loaded offline page — will retry connection");
                }
            });
        }
        scheduleReconnect();
    }

    // ============================================
    // RECONNECT LOGIC
    // ============================================

    private void scheduleReconnect() {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Log.e(TAG, "Max reconnect attempts reached");
            return;
        }
        reconnectAttempts++;
        Log.i(TAG, "Reconnect attempt " + reconnectAttempts + "/" + MAX_RECONNECT_ATTEMPTS);
        mainHandler.postDelayed(() -> {
            if (isShowingOfflinePage) checkAndReload();
        }, RECONNECT_DELAY_MS);
    }

    private void checkAndReload() {
        if (!isNetworkAvailable()) {
            Log.w(TAG, "Still offline — scheduling another reconnect");
            scheduleReconnect();
            return;
        }
        Log.i(TAG, "Network detected — reloading kiosk page");
        if (webView != null) {
            mainHandler.post(() -> {
                if (webView != null) webView.loadUrl(KIOSK_URL);
            });
        }
    }

    // ============================================
    // CONNECTIVITY MONITORING
    // ============================================

    private void registerConnectivityMonitoring() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                Log.e(TAG, "ConnectivityManager not available");
                return;
            }

            NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED)
                .build();

            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    Log.i(TAG, "Network became available");
                    if (isShowingOfflinePage) {
                        mainHandler.postDelayed(() -> {
                            if (isShowingOfflinePage && webView != null) {
                                reconnectAttempts = 0;
                                mainHandler.post(() -> {
                                    if (webView != null) webView.loadUrl(KIOSK_URL);
                                });
                            }
                        }, CONNECTIVITY_CHECK_MS);
                    }
                }

                @Override
                public void onLost(Network network) {
                    Log.w(TAG, "Network lost");
                }

                @Override
                public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                    boolean hasInternet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                    if (hasInternet && isShowingOfflinePage) {
                        Log.i(TAG, "Validated internet — reloading kiosk");
                        mainHandler.postDelayed(() -> {
                            if (isShowingOfflinePage && webView != null) {
                                reconnectAttempts = 0;
                                mainHandler.post(() -> {
                                    if (webView != null) webView.loadUrl(KIOSK_URL);
                                });
                            }
                        }, CONNECTIVITY_CHECK_MS);
                    }
                }
            };

            cm.registerNetworkCallback(request, networkCallback);
            Log.i(TAG, "Network monitoring registered");
        } catch (SecurityException e) {
            Log.e(TAG, "Cannot register network callback: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Network monitoring failed: " + e.getMessage());
        }
    }

    private void unregisterConnectivityMonitoring() {
        if (networkCallback != null) {
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) cm.unregisterNetworkCallback(networkCallback);
            } catch (Exception e) {
                Log.w(TAG, "Error unregistering network callback: " + e.getMessage());
            }
        }
    }

    // ============================================
    // NETWORK CHECK
    // ============================================

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network activeNetwork = cm.getActiveNetwork();
            if (activeNetwork == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (SecurityException e) {
            return true;
        }
    }

    // ============================================
    // BACK BUTTON — Compatible with all Android versions
    // ============================================

    @Override
    public void onBackPressed() {
        // In kiosk mode, only allow WebView navigation
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        }
        // Do NOT call super — prevent exit from kiosk
    }

    // ============================================
    // SECRET EXIT — 5-tap top-left corner + PIN
    // ============================================

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (ev.getAction() == MotionEvent.ACTION_DOWN) {
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
                    Log.i(TAG, "Secret exit triggered");
                    showAdminDialog();
                }
            }
        }
        return super.dispatchTouchEvent(ev);
    }

    private void showAdminDialog() {
        try {
            EditText pinInput = new EditText(this);
            pinInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
            pinInput.setHint("Enter admin PIN");
            pinInput.setMaxLines(1);

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
                        Log.w(TAG, "Incorrect admin PIN");
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
        } catch (Exception e) {
            Log.e(TAG, "Admin dialog failed: " + e.getMessage());
        }
    }

    private void showAdminOptionsDialog() {
        Log.i(TAG, "Admin access granted");
        try {
            String[] options = {"Close App", "Android Settings", "Reload Kiosk"};
            new AlertDialog.Builder(this)
                .setTitle("Admin Options")
                .setItems(options, (dialog, which) -> {
                    switch (which) {
                        case 0: closeApp(); break;
                        case 1: openAndroidSettings(); break;
                        case 2: reloadKiosk(); break;
                    }
                })
                .setNegativeButton("Cancel", null)
                .setCancelable(true)
                .show();
        } catch (Exception e) {
            Log.e(TAG, "Admin options dialog failed: " + e.getMessage());
        }
    }

    private void closeApp() {
        unregisterConnectivityMonitoring();
        mainHandler.removeCallbacksAndMessages(null);
        finishAffinity();
        System.exit(0);
    }

    private void openAndroidSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to open Settings: " + e.getMessage());
        }
    }

    private void reloadKiosk() {
        isShowingOfflinePage = false;
        reconnectAttempts = 0;
        if (webView != null) {
            webView.clearCache(true);
            webView.loadUrl(KIOSK_URL);
        }
    }
}
