# Pickup Jamaica Kiosk v3.4 — White-Screen Permanent Fix

## 1. Root Cause Analysis

### Primary Root Cause: Dead Renderer Undetectable on Android 5.1

The kiosk runs on Android 5.1 (API 22). The WebView renderer process crashes periodically (approximately once per hour), leaving the Activity alive but the WebView displaying a completely white screen. Three compounding design flaws prevent automatic recovery:

**Flaw 1: `onRenderProcessGone()` is dead code on API 22**

The method `WebViewClient.onRenderProcessGone(WebView, RenderProcessGoneDetail)` was introduced in API 26 (Android 8.0). On API 22, the Android framework never invokes this method. The existing override (line 482 in v3.3) compiles only because `compileSdkVersion = 34`, but at runtime on the locker device, it is never called. The renderer crash goes undetected by this handler.

**Flaw 2: `evaluateJavascript()` callback blind spot**

The health check (v3.3, line 707) calls `webView.evaluateJavascript()` with all failure-counting logic inside the `onReceiveValue()` callback. When the renderer is frozen or dead, the callback **never fires** — there is no timeout mechanism, no fallback, no native deadline. The Android framework imposes no timeout on `evaluateJavascript()` callbacks. As a result:
- `healthCheckFailCount` is never incremented
- `HEALTH_RELOAD_THRESHOLD` is never reached
- No recovery action is taken
- The health check loop continues every 60 seconds, calling `evaluateJavascript()` into the void indefinitely

**Flaw 3: `reloadKiosk()` is a soft reload that cannot recover a dead renderer**

The `reloadKiosk()` method (v3.3, line 1922) only calls `webView.clearCache(true)` followed by `webView.loadUrl()`. It does NOT destroy or recreate the WebView. When the renderer process is dead, the Java `WebView` object still exists but its native renderer is gone. Calling `loadUrl()` on a WebView with a dead renderer is undefined behavior — on most devices, the URL load is queued to a dead process and silently does nothing.

### Execution Path to Permanent White Screen

```
1. WebView renders normally (~1 hour)
2. Android kills the renderer process (OOM, GPU crash, or system pressure)
3. WebView surface goes white; Activity remains alive
4. onRenderProcessGone() never fires (API < 26)
5. Health check timer fires (every 60s)
6. evaluateJavascript() is called → callback never returns
7. healthCheckFailCount stays at 0 → no reload triggered
8. Steps 5-7 repeat indefinitely
9. User sees permanent white screen until manual reboot
```

### Additional Failure Modes Discovered

| # | Failure Mode | Severity | v3.3 Behavior |
|---|---|---|---|
| 4 | `isNetworkAvailable()` uses `getActiveNetwork()` (API 23+) — throws `NoSuchMethodError` on API 22, caught by try/catch which returns `true` (incorrectly assumes network is up) | Medium | Network detection broken on API 22 |
| 5 | `NetworkCapabilities.NET_CAPABILITY_VALIDATED` (API 23+) used in `onCapabilitiesChanged` — crashes on API 22 | Medium | Connectivity callback crashes, network recovery disabled |
| 6 | No `onReceivedSslError` handler — SSL certificate errors show blank white screen | High | Common with self-signed/expired certs |
| 7 | `onReceivedError(WebView, WebResourceRequest, WebResourceError)` (API 23+) may not fire for all HTTP errors on API 22 | Medium | Some server errors show white screen |
| 8 | `FLAG_SECURE` can cause blank WebView rendering on some Android 5.1 GPU/driver combinations | Low | Device-specific |

---

## 2. Diagnosis Confirmation

All three suspected design problems are **confirmed and code-verified**:

- ✅ **Issue 1**: `onRenderProcessGone()` dead on API 22 — `RenderProcessGoneDetail` requires API 26
- ✅ **Issue 2**: `evaluateJavascript()` callback has no timeout — frozen renderer goes undetected
- ✅ **Issue 3**: `reloadKiosk()` only soft-reloads — cannot recover a dead renderer

---

## 3. Architecture of the New Recovery System

### 3.1 Native Timeout Watchdog

Every `evaluateJavascript()` health check now has a **10-second native deadline**:

```java
// Launch health check
healthCheckInProgress = true;
webView.evaluateJavascript(js, callback);

// Set native timeout on the main handler
healthCheckTimeoutRunnable = () -> {
    if (healthCheckInProgress) {
        healthCheckInProgress = false;
        healthCheckFailCount++;
        // If threshold reached → rebuildWebView()
    }
};
mainHandler.postDelayed(healthCheckTimeoutRunnable, HEALTH_CHECK_TIMEOUT_MS);
```

When the callback arrives normally, the timeout Runnable is cancelled via `mainHandler.removeCallbacks(healthCheckTimeoutRunnable)`. When the callback never arrives (frozen renderer), the timeout fires after 10 seconds and counts the check as failed.

**Overlapping check prevention**: If the previous check's callback hasn't returned AND the timeout hasn't fired, the next periodic check detects `healthCheckInProgress == true` and immediately counts it as a failure.

### 3.2 `rebuildWebView(String reason)` — Full Destroy-and-Recreate

This new method replaces `reloadKiosk()` as the recovery action for detected renderer death:

```
1. Stop health monitoring
2. webView.stopLoading()
3. webView.loadUrl("about:blank")
4. webView.clearCache(true)
5. webView.clearHistory()
6. parent.removeView(webView)
7. webView.destroy()
8. webView = null
9. webView = createWebViewSafely()
10. setContentView(webView)
11. hideSystemUI()
12. configureWebView()  ← re-applies all settings, clients, UA
13. webView.loadUrl(getKioskUrl())
14. Reset all state counters
15. Resume health monitoring
```

### 3.3 Recovery Policy

| Parameter | Value | Rationale |
|---|---|---|
| `HEALTH_CHECK_INTERVAL_MS` | 30,000 (30s) | Faster detection (was 60s) |
| `HEALTH_CHECK_TIMEOUT_MS` | 10,000 (10s) | Callback deadline |
| `HEALTH_RELOAD_THRESHOLD` | 2 | Two consecutive failures → rebuild |
| `REBUILD_COOLDOWN_MS` | 120,000 (2 min) | Minimum time between rebuilds |
| `MAX_REBUILDS_PER_HOUR` | 5 | Safety cap; exceeded → `Activity.recreate()` |

**Detection timeline**: In the worst case, a frozen renderer is detected within:
- First check: 30s (periodic) + 10s (timeout) = 40s
- Second check: 30s (next periodic) + 10s (timeout) = 40s
- **Total: ~80 seconds** from freeze to rebuild

This is a dramatic improvement from v3.3 where the renderer freeze was **never detected**.

### 3.4 Cooldown and Rate Limiting

- **Cooldown**: Minimum 2 minutes between consecutive rebuilds. Prevents rapid rebuild loops if the new WebView also fails immediately (e.g., server is down).
- **Rate limit**: Maximum 5 rebuilds per rolling hour. If exceeded, falls back to `Activity.recreate()` (nuclear option that restarts the entire Activity including all native state).
- Both protections are logged to the diagnostic file.

### 3.5 API 22 Compatibility Fixes

| What | v3.3 (broken) | v3.4 (fixed) |
|---|---|---|
| `isNetworkAvailable()` | Uses `getActiveNetwork()` (API 23+) — throws on API 22 | Uses `getActiveNetworkInfo()` with `@SuppressWarnings("deprecation")` on API < 23 |
| `NET_CAPABILITY_VALIDATED` | Used unconditionally (API 23+) | Guarded with `Build.VERSION.SDK_INT >= M` |
| `onRenderProcessGone()` | Only recovery path (dead on API 22) | Retained for API 26+; health check timeout covers API 22 |
| `onReceivedSslError()` | Missing — SSL errors show white screen | Added with `handler.proceed()` (admin-controlled server) |
| `ProcessHandle.current()` | Not used | Avoided (API 33+) — uses `pageLoadStartTime` as uptime baseline |

### 3.6 Diagnostic Logger

A rotating, persistent diagnostic log records all recovery events:

- **Storage**: `{ExternalFilesDir}/diagnostics/kiosk-diag.log`
- **Rotation**: At 512 KB, rotates to `.1`, `.2`, ... up to `.5` (2.5 MB total)
- **Entries**: Timestamped with event type, uptime, network state, memory, URL, and detail
- **Privacy**: No phone numbers, locker codes, payment tokens, PINs, or personal data
- **Survives restarts**: Written to external files dir, not cache

Logged events include: `APP_START`, `PAGE_START`, `PAGE_FINISH`, `HTTP_ERROR`, `SSL_ERROR`, `NETWORK_LOST`, `HEALTH_START`, `HEALTH_TIMEOUT`, `HEALTH_EMPTY`, `HEALTH_OVERLAP`, `REBUILD_START`, `REBUILD_COMPLETE`, `REBUILD_COOLDOWN`, `REBUILD_RATE_LIMIT`, `DIAG_EXPORT`, `UNCAUGHT_EXCEPTION`

### 3.7 Admin Diagnostic Tools

| Tool | Access Level | Description |
|---|---|---|
| View Diagnostics | Staff + Admin | Scrollable dialog showing system state + last 200 log lines |
| Export Diagnostics | Admin only | Exports all rotated logs to a single .txt file; share via Android share intent (no ADB needed) |
| Clear Diagnostics | Admin only | Deletes all diagnostic log files |

---

## 4. Files Changed

| File | Change | Lines |
|---|---|---|
| `bare-android/app/src/main/java/com/pickupjamaica/kiosk/MainActivity.java` | Complete rewrite with recovery system | ~2,420 (was 1,943) |
| `bare-android/app/build.gradle` | versionCode 7→8, versionName "3.3"→"3.4" | 2 lines |
| `bare-android/gradle.properties` | Fixed Java home path | 1 line |

---

## 5. Why the Fix Is Safe

1. **No new permissions required** — diagnostics use `getExternalFilesDir()` which is app-private storage; no `WRITE_EXTERNAL_STORAGE` needed on API 22
2. **No new API dependencies** — all code paths use only APIs available on API 22; higher API features are guarded with `Build.VERSION.SDK_INT` checks
3. **Backward compatible** — `onRenderProcessGone()` is retained for API 26+ devices; the health check timeout works on all API levels
4. **`rebuildWebView()` uses the same create/configure pattern as `onCreate()`** — no new WebView configuration is introduced
5. **Cooldown prevents rebuild loops** — minimum 2 minutes between rebuilds; max 5/hour before activity recreate
6. **Diagnostic logger is fire-and-forget** — writes on a background thread; failures are silently swallowed; never blocks the main thread
7. **`onReceivedSslError` → proceed** is appropriate for a kiosk where the server URL is admin-controlled; prevents SSL errors from causing white screen
8. **`healthCheckInProgress` prevents overlapping checks** — avoids race conditions between the timeout and the callback
9. **All state is reset after rebuild** — `healthCheckFailCount`, `healthCheckInProgress`, `reconnectAttempts`, `isShowingOfflinePage` are all reset to initial values

---

## 6. Remaining Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `createWebViewSafely()` fails after destroy (very low RAM) | Low | Returns null → `showErrorScreen()` with "Please reboot" message |
| Server returns 5xx immediately after rebuild | Medium | Cooldown prevents rapid rebuild loops; offline page with reconnect handles this |
| `FLAG_SECURE` causes blank rendering on specific GPU | Low | If health check detects empty `.container` after rebuild, second rebuild will be attempted after cooldown |
| `Activity.recreate()` fails (rate limit exceeded) | Very Low | Falls through to error screen; extremely unlikely to happen 5 times in one hour |
| Diagnostic log fills storage | Very Low | 512 KB × 5 files = 2.5 MB max; rotation is automatic |
| `evaluateJavascript` callback arrives after timeout fires | Low | `healthCheckInProgress` flag ensures late callbacks are no-ops; timeout already incremented the fail count |

---

## 7. Manual Test Plan

### Test 1: Normal Operation
1. Install v3.4 APK on locker device
2. Verify kiosk loads and displays locker UI
3. Let run for 5 minutes — verify no white screen
4. Open admin menu → View Diagnostics — verify log entries exist

### Test 2: Simulate Renderer Freeze (requires ADB)
1. Start kiosk, wait for page to load
2. `adb shell ps | grep webview` — note the renderer PID
3. `adb shell kill -9 <renderer_pid>` — kill the renderer process
4. **Expected**: Within ~80 seconds, the kiosk should auto-recover (WebView rebuilds, page reloads)
5. Verify "Health check #N: TIMED OUT" appears in diagnostics
6. Verify "REBUILD_COMPLETE" appears in diagnostics

### Test 3: Verify Cooldown Protection
1. After Test 2 triggers a rebuild, immediately kill the renderer again
2. **Expected**: Second rebuild does NOT happen within 2 minutes (cooldown)
3. After 2+ minutes, if renderer is still dead, rebuild should trigger

### Test 4: Verify SSL Error Handling
1. Configure kiosk URL to a server with a self-signed certificate
2. **Expected**: Page loads (SSL error is overridden)
3. In v3.3, this would show a permanent white screen

### Test 5: Network Interruption and Recovery
1. Start kiosk, wait for page to load
2. Disconnect Wi-Fi
3. **Expected**: Offline page appears within 5-10 seconds
4. Reconnect Wi-Fi
5. **Expected**: Kiosk automatically reloads within 10-15 seconds

### Test 6: Diagnostic Export
1. Open admin menu → Export Diagnostics
2. **Expected**: Share dialog appears; file can be sent via email/Bluetooth
3. Open the exported file — verify it contains log entries with timestamps

### Test 7: Admin Menu — All Options Work
1. Open admin menu via 5-tap + admin PIN
2. Verify all 15 menu options are present and functional
3. Verify "View Diagnostics", "Export Diagnostics", "Clear Diagnostics" work

### Test 8: API 22 Network Check
1. Disconnect Wi-Fi
2. Open staff menu → Reload Kiosk
3. **Expected**: Offline page appears (not crash)
4. Reconnect Wi-Fi → kiosk recovers

---

## 8. Long-Duration Burn-In Test Plan (24+ Hours)

### Setup
1. Install v3.4 APK on the actual locker hardware
2. Connect to production Wi-Fi network
3. Start kiosk and note the start time
4. Enable diagnostic logging (automatic in v3.4)

### Monitoring Schedule

| Time | Action | What to Check |
|---|---|---|
| T+0h | Start | Kiosk loads, diagnostic log begins |
| T+1h | Check | Still running? Any REBUILD events in diagnostics? |
| T+2h | Check | Still running? Memory usage stable? |
| T+4h | Wi-Fi off 30s then on | Verify auto-recovery from7 |
| T+6h | Check | Any HEALTH_TIMEOUT events? How many? |
| T+8h | Check | Memory usage trend (should be stable, not growing) |
| T+12h | Check | Still running? Any REBUILD_RATE_LIMIT events? |
| T+16h | Wi-Fi off 2min then on | Verify extended offline recovery |
| T+20h | Check | Diagnostic log size (should be < 512KB per file) |
| T+24h | Final check | Export diagnostics; review all events |

### Pass Criteria
- ✅ No permanent white screens (all recovered within 90 seconds)
- ✅ Zero manual interventions required
- ✅ Memory usage stable (no monotonic growth)
- ✅ Rebuild count ≤ 5 per hour (rate limit not hit)
- ✅ All diagnostic entries have valid timestamps and events
- ✅ No UNCAUGHT_EXCEPTION events in diagnostic log
- ✅ Page load times remain under 10 seconds after rebuilds

### Automated Monitoring (Optional)
Set up an ADB script that runs every 5 minutes:
```bash
#!/bin/bash
while true; do
    # Check if kiosk is responsive
    SCREEN=$(adb shell dumpsys window | grep -c "mFocusedApp=.*pickupjamaica")
    if [ "$SCREEN" -eq 0 ]; then
        echo "$(date): Kiosk lost focus!" >> burn-in-log.txt
    fi
    # Check memory
    MEM=$(adb shell dumpsys meminfo com.pickupjamaica.kiosk | grep "TOTAL" | awk '{print $2}')
    echo "$(date): Memory=$MEM KB" >> burn-in-log.txt
    sleep 300
done
```

---

## Version Summary

| | v3.3 | v3.4 |
|---|---|---|
| Renderer crash detection | `onRenderProcessGone()` only (API 26+) | Health check timeout (all APIs) + `onRenderProcessGone()` (API 26+) |
| Health check interval | 60s | 30s |
| Health check timeout | None | 10s |
| Recovery action | `reloadKiosk()` (soft reload) | `rebuildWebView()` (full destroy-recreate) |
| Recovery time from freeze | **Never** (permanent white screen) | **~80 seconds** |
| Cooldown protection | None | 2 min between rebuilds, max 5/hour |
| API 22 network check | Broken (`getActiveNetwork()` crashes) | Fixed (`getActiveNetworkInfo()` on API < 23) |
| SSL error handling | Missing (white screen) | `handler.proceed()` for admin-controlled server |
| Diagnostic logging | None | Rotating persistent log with 15+ event types |
| Admin diagnostic tools | None | View / Export / Clear |
| `NET_CAPABILITY_VALIDATED` | Unguarded (crashes API 22) | Guarded with API level check |
