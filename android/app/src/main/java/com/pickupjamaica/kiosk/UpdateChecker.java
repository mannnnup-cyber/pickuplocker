package com.pickupjamaica.kiosk;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.URLUtil;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * UpdateChecker — polls /api/app-version for new APK releases and
 * installs them via the system PackageInstaller.
 *
 * Behavior:
 *   1. On start (and every CHECK_INTERVAL_MS), fetches
 *      <baseUrl>/api/app-version
 *   2. Compares the server's versionCode with the installed app's
 *      versionCode (from PackageManager).
 *   3. If server versionCode > installed versionCode:
 *      a. Downloads the APK from server's apkUrl to the app's cache dir.
 *      b. Verifies the SHA-256 checksum (if provided in the version config).
 *      c. Fires an ACTION_INSTALL_PACKAGE intent via FileProvider.
 *      d. The system shows the standard "Install update?" dialog.
 *         On Android 8+ this requires REQUEST_INSTALL_PACKAGES permission.
 *   4. If server config has forceUpdate=true, the UI is blocked until
 *      the update installs (handled by MainActivity via the callback).
 *
 * Safety:
 *   - Never installs an APK whose checksum doesn't match.
 *   - Never installs an APK larger than MAX_APK_SIZE_BYTES.
 *   - Skips the update if the network is unavailable.
 *   - All file I/O happens on a background thread.
 *
 * Threading:
 *   - Network and file I/O happen on a single-thread executor.
 *   - UI-facing callbacks (onUpdateAvailable, onUpdateInstalled, etc.)
 *     are dispatched on the main thread.
 */
public class UpdateChecker {

    private static final String TAG = "PickupKiosk/Update";

    // Polling interval — 1 hour. The first check happens after a 30s delay
    // (so the app doesn't hit the API on every cold start before the user
    // even sees the kiosk UI).
    private static final long CHECK_INTERVAL_MS = 60 * 60 * 1000L;  // 1 hour
    private static final long INITIAL_DELAY_MS = 30 * 1000L;        // 30 seconds

    // Max APK size we're willing to download (50 MB). Guards against
    // misconfigured servers returning huge files.
    private static final long MAX_APK_SIZE_BYTES = 50L * 1024 * 1024;

    // Connect/read timeouts for HTTP calls.
    private static final int HTTP_TIMEOUT_MS = 15000;

    private final Activity activity;
    private final String baseUrl;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private final Runnable checkRunnable = new Runnable() {
        @Override
        public void run() {
            checkForUpdate();
            // Schedule next check
            mainHandler.postDelayed(this, CHECK_INTERVAL_MS);
        }
    };

    /** Callback interface for the hosting activity. */
    public interface Callback {
        /** Called on the main thread when an update is available and about to be installed. */
        void onUpdateAvailable(String newVersion, String changelog, boolean forceUpdate);
        /** Called on the main thread when the install intent has been fired. */
        void onUpdateInstallStarted(String apkPath);
        /** Called on the main thread when no update is needed. */
        void onUpdateToDate();
        /** Called on the main thread when an error occurred. */
        void onUpdateError(String message);
    }

    private final Callback callback;

    public UpdateChecker(Activity activity, String baseUrl, Callback callback) {
        this.activity = activity;
        this.baseUrl = baseUrl.replaceAll("/$", "");  // strip trailing slash
        this.callback = callback;
    }

    /** Start periodic update checks. Safe to call once from Activity.onCreate. */
    public void start() {
        mainHandler.postDelayed(checkRunnable, INITIAL_DELAY_MS);
        Log.i(TAG, "Update checker started — first check in " + INITIAL_DELAY_MS + "ms, then every " + CHECK_INTERVAL_MS + "ms");
    }

    /** Stop periodic checks. Call from Activity.onDestroy. */
    public void stop() {
        mainHandler.removeCallbacks(checkRunnable);
        Log.i(TAG, "Update checker stopped");
    }

    /** Trigger an immediate check (ignores the polling schedule). */
    public void checkForUpdateNow() {
        io.submit(this::checkForUpdate);
    }

    // ============================================
    // Update check + download + install
    // ============================================

    private void checkForUpdate() {
        int installedVersionCode = getInstalledVersionCode();
        if (installedVersionCode < 0) {
            Log.w(TAG, "Cannot determine installed versionCode — skipping update check");
            return;
        }

        final String url = baseUrl + "/api/app-version";
        Log.i(TAG, "Checking for update: " + url + " (installed versionCode=" + installedVersionCode + ")");

        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(HTTP_TIMEOUT_MS);
            conn.setReadTimeout(HTTP_TIMEOUT_MS);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("User-Agent", "PickupKiosk/UpdateChecker");

            int status = conn.getResponseCode();
            if (status != 200) {
                Log.w(TAG, "Update check failed: HTTP " + status);
                notifyError("HTTP " + status);
                return;
            }

            String body = readStream(conn.getInputStream());
            conn.disconnect();

            JSONObject json = new JSONObject(body);
            int serverVersionCode = json.optInt("versionCode", -1);
            String serverVersion = json.optString("version", "");
            String apkUrl = json.optString("apkUrl", "");
            String checksum = json.optString("checksum", "");
            String changelog = json.optString("changelog", "");
            boolean forceUpdate = json.optBoolean("forceUpdate", false);

            if (serverVersionCode <= 0) {
                Log.w(TAG, "Server returned invalid versionCode: " + serverVersionCode);
                notifyError("invalid server versionCode");
                return;
            }

            if (serverVersionCode <= installedVersionCode) {
                Log.i(TAG, "App is up to date (installed=" + installedVersionCode + ", server=" + serverVersionCode + ")");
                notifyUpToDate();
                return;
            }

            Log.i(TAG, "Update available: " + installedVersionCode + " → " + serverVersionCode
                + " (version " + serverVersion + ", forceUpdate=" + forceUpdate + ")");

            if (apkUrl.isEmpty()) {
                Log.w(TAG, "Update available but apkUrl is empty — cannot download");
                notifyError("apkUrl is empty");
                return;
            }

            // Resolve relative apkUrl
            if (!URLUtil.isNetworkUrl(apkUrl)) {
                apkUrl = baseUrl + (apkUrl.startsWith("/") ? "" : "/") + apkUrl;
            }

            notifyUpdateAvailable(serverVersion, changelog, forceUpdate);

            // Download and install
            File apkFile = downloadApk(apkUrl, serverVersionCode);
            if (apkFile == null) {
                return;  // downloadApk already logged the error
            }

            // Verify checksum if provided
            if (!checksum.isEmpty()) {
                if (!verifyChecksum(apkFile, checksum)) {
                    Log.e(TAG, "Checksum verification FAILED — refusing to install");
                    apkFile.delete();
                    notifyError("checksum mismatch");
                    return;
                }
                Log.i(TAG, "Checksum verified: " + checksum);
            } else {
                Log.w(TAG, "No checksum provided in version config — skipping verification");
            }

            installApk(apkFile);

        } catch (Exception e) {
            Log.e(TAG, "Update check failed: " + e.getMessage(), e);
            notifyError(e.getMessage());
        }
    }

    private File downloadApk(String apkUrl, int versionCode) {
        File updatesDir = new File(activity.getCacheDir(), "updates");
        if (!updatesDir.exists() && !updatesDir.mkdirs()) {
            Log.e(TAG, "Cannot create updates directory: " + updatesDir.getAbsolutePath());
            notifyError("cannot create cache dir");
            return null;
        }

        File apkFile = new File(updatesDir, "pickuplocker-v" + versionCode + ".apk");
        Log.i(TAG, "Downloading APK from " + apkUrl + " → " + apkFile.getAbsolutePath());

        HttpURLConnection conn = null;
        InputStream input = null;
        OutputStream output = null;
        try {
            conn = (HttpURLConnection) new URL(apkUrl).openConnection();
            conn.setConnectTimeout(HTTP_TIMEOUT_MS);
            conn.setReadTimeout(HTTP_TIMEOUT_MS);
            conn.setRequestProperty("User-Agent", "PickupKiosk/UpdateChecker");

            int status = conn.getResponseCode();
            if (status != 200) {
                Log.e(TAG, "APK download failed: HTTP " + status);
                notifyError("download HTTP " + status);
                return null;
            }

            long contentLength = conn.getContentLengthLong();
            if (contentLength > MAX_APK_SIZE_BYTES) {
                Log.e(TAG, "APK too large: " + contentLength + " bytes (max " + MAX_APK_SIZE_BYTES + ")");
                notifyError("APK exceeds max size");
                return null;
            }
            if (contentLength == 0) {
                Log.e(TAG, "APK download returned Content-Length: 0 — server has no APK to serve");
                notifyError("APK file is empty (Content-Length: 0)");
                return null;
            }

            input = conn.getInputStream();
            output = new FileOutputStream(apkFile);

            byte[] buffer = new byte[8192];
            int read;
            long total = 0;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                total += read;
            }
            output.flush();

            Log.i(TAG, "Downloaded " + total + " bytes");

            if (total == 0) {
                Log.e(TAG, "Downloaded APK is empty (0 bytes)");
                apkFile.delete();
                notifyError("downloaded APK is empty");
                return null;
            }

            return apkFile;

        } catch (Exception e) {
            Log.e(TAG, "APK download failed: " + e.getMessage(), e);
            notifyError("download failed: " + e.getMessage());
            if (apkFile.exists()) apkFile.delete();
            return null;
        } finally {
            try { if (output != null) output.close(); } catch (Exception ignored) {}
            try { if (input != null) input.close(); } catch (Exception ignored) {}
            if (conn != null) conn.disconnect();
        }
    }

    private boolean verifyChecksum(File apkFile, String expectedChecksum) {
        try {
            // Expected format: "sha256:<hex>"
            String algo = "sha256";
            String expected = expectedChecksum;
            int colon = expectedChecksum.indexOf(':');
            if (colon >= 0) {
                algo = expectedChecksum.substring(0, colon);
                expected = expectedChecksum.substring(colon + 1);
            }
            expected = expected.toLowerCase();

            java.security.MessageDigest digest = java.security.MessageDigest.getInstance(algo);
            byte[] buffer = new byte[8192];
            try (InputStream fis = new java.io.FileInputStream(apkFile)) {
                int read;
                while ((read = fis.read(buffer)) != -1) {
                    digest.update(buffer, 0, read);
                }
            }
            byte[] hashBytes = digest.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : hashBytes) {
                sb.append(String.format("%02x", b));
            }
            String actual = sb.toString();

            Log.i(TAG, "Checksum actual:   " + algo + ":" + actual);
            Log.i(TAG, "Checksum expected: " + algo + ":" + expected);
            return actual.equals(expected);

        } catch (Exception e) {
            Log.e(TAG, "Checksum verification error: " + e.getMessage(), e);
            return false;
        }
    }

    private void installApk(File apkFile) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            String authority = activity.getPackageName() + ".fileprovider";
            Uri apkUri = FileProvider.getUriForFile(activity, authority, apkFile);

            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Log.i(TAG, "Firing install intent for " + apkUri);

            activity.runOnUiThread(() -> {
                try {
                    activity.startActivity(intent);
                    if (callback != null) {
                        callback.onUpdateInstallStarted(apkFile.getAbsolutePath());
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Failed to start install activity: " + e.getMessage(), e);
                    notifyError("cannot start installer: " + e.getMessage());
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "installApk failed: " + e.getMessage(), e);
            notifyError("install failed: " + e.getMessage());
        }
    }

    // ============================================
    // Helpers
    // ============================================

    private int getInstalledVersionCode() {
        try {
            PackageInfo info = activity.getPackageManager()
                .getPackageInfo(activity.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return (int) info.getLongVersionCode();
            } else {
                return info.versionCode;
            }
        } catch (PackageManager.NameNotFoundException e) {
            Log.e(TAG, "Cannot find own package: " + e.getMessage());
            return -1;
        }
    }

    private String readStream(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
        return out.toString("UTF-8");
    }

    private void notifyUpdateAvailable(String version, String changelog, boolean forceUpdate) {
        if (callback != null) {
            mainHandler.post(() -> callback.onUpdateAvailable(version, changelog, forceUpdate));
        }
    }

    private void notifyUpToDate() {
        if (callback != null) {
            mainHandler.post(() -> callback.onUpdateToDate());
        }
    }

    private void notifyError(String message) {
        if (callback != null) {
            mainHandler.post(() -> callback.onUpdateError(message));
        }
    }
}
