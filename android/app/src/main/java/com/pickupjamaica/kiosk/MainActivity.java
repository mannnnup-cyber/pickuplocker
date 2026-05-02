package com.pickupjamaica.kiosk;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen on for kiosk mode
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Fullscreen - hide status bar and navigation bar
        hideSystemUI();

        // Configure WebView for Android 5.0 compatibility
        configureWebView();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    private void hideSystemUI() {
        // Immersive sticky mode - hides status bar and nav bar
        View decorView = getWindow().getDecorView();
        int uiOptions = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN;
        decorView.setSystemUiVisibility(uiOptions);
    }

    private void configureWebView() {
        // Access the Capacitor WebView and configure it for Android 5.0
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();

            // Enable JavaScript (should be on by default but be explicit)
            settings.setJavaScriptEnabled(true);

            // Enable DOM storage
            settings.setDomStorageEnabled(true);

            // Allow file access for local assets
            settings.setAllowFileAccess(true);

            // Set a sensible user agent that includes Android version
            // so the server can detect old Android and serve kiosk-lite
            String defaultUA = settings.getUserAgentString();
            // Keep the default UA which includes Android version info

            // Enable mixed content mode (in case of HTTP/HTTPS mix)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }

            // Set cache mode - use network first, cache as fallback
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            // Enable zoom controls (disabled for kiosk)
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
        }
    }
}
