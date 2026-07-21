---
Task ID: 1
Agent: main
Task: Add email invitation feature for staff and courier account creation, plus activate/deactivate toggle

Work Log:
- Added `sendStaffInviteEmail()` function to email.ts - sends a branded invite email with username, role, and login URL
- Added `sendCourierWelcomeEmail()` function to email.ts - sends a branded welcome email with PIN setup instructions and temp PIN (if available)
- Modified POST /api/users to accept `sendInvite` param and send invite email on staff creation
- Modified PATCH /api/users/[id] to accept `resendInvite` param for resending invite emails
- Modified POST /api/couriers to accept `sendWelcomeEmail` param and send welcome email on courier creation
- Updated Staff UI in dashboard: added "Send invite email" checkbox (default ON), quick toggle switch for active/disabled status, and resend invite button (mail icon)
- Updated Courier UI in dashboard: added "Send welcome email" checkbox (default ON) with description
- Build verified successfully

Stage Summary:
- Staff accounts now send invitation emails with login details when created
- Courier accounts can send welcome emails with PIN setup instructions
- Staff cards have a quick toggle switch for activate/deactivate (no longer need to open edit dialog)
- Staff cards have a resend invite button (mail icon)
- All changes are backward compatible - existing functionality preserved

---
Task ID: 2
Agent: main
Task: Fix kiosk white screen timeout issues

Work Log:
- Created global-error.tsx with auto-reload after 5 seconds for root layout crashes
- Created kiosk-fetch.ts utility with 10s timeout + HTTP status validation
- Inlined kioskFetch() function directly in page.tsx to avoid SSR bundling issues
- Replaced ALL 13 raw fetch() calls in kiosk page with kioskFetch() (10s timeout, 15s for box availability)
- Added res.ok check in kioskFetch — throws on non-2xx HTTP responses (prevents silent bad data)
- Added timeout-specific error messages: "Server is taking too long to respond. Please try again."
- Fixed heartbeat recovery: was a no-op (only cleared localStorage), now actually calls window.location.reload()
- Added crash detection via beforeunload event + CRASH_KEY in localStorage
- Added global unhandled rejection handler that clears loading states and auto-recovers after 5 seconds
- Added stuck-state watchdog: detects when loading/loadingBoxes is true for >30s and forces recovery
- Added 15s timeout to ALL 14 Bestwond API fetch calls in bestwond.ts via fetchWithTimeout helper
- Moved resetState useCallback before useEffects that reference it (fixed SSR build error)
- Build verified successfully

Stage Summary:
- Kiosk white screen should be eliminated by:
  1. All API calls now timeout after 10-15 seconds (no more infinite hangs)
  2. HTTP error responses are properly caught (no more silent failures)
  3. Root layout crashes auto-reload after 5 seconds
  4. Unhandled promise rejections are caught and trigger recovery
  5. Stuck loading states auto-recover after 30 seconds
  6. Crashed sessions auto-reload on next page visit
  7. Server-side Bestwond API calls timeout after 15 seconds (prevents server hangs)

---
Task ID: 3
Agent: main
Task: Implement in-app update system for the PICKUP kiosk APK + update documentation

Work Log:
- Created /api/app-version endpoint (GET + POST) for version checking and config updates
- Created /api/app-version/download endpoint for serving APK files
- Created app-version.json config file for version management
- Added in-app update system to MainActivity.java:
  - Auto-checks for updates on startup (30s delay) and every 4 hours
  - Manual "Check for Updates" in both Staff and Admin menus
  - "Install Update" option in Admin menu (shows pending version)
  - Downloads APK with progress dialog (MB counter)
  - SHA-256 checksum verification
  - FileProvider for Android 7+ APK install
  - Android 8+ install permission handling
  - Force update support (blocking dialog)
  - Skip version support
- Added new permissions to AndroidManifest.xml:
  - REQUEST_INSTALL_PACKAGES
  - WRITE_EXTERNAL_STORAGE
  - READ_EXTERNAL_STORAGE
- Added FileProvider declaration to AndroidManifest.xml
- Created file_paths.xml for FileProvider configuration
- Updated build.gradle version to 3.3 (code 7)
- Updated build script for v3.3
- Installed JDK 17 (required for Gradle build due to AGP jlink bug with JDK 21)
- Installed Android SDK Platform 34 + Build Tools
- Successfully built v3.3 APK via full Gradle build
- Updated README.md comprehensively with all missing features:
  - In-app update documentation
  - Kiosk app details (PINs, menus, release history)
  - Manual payment system
  - Staff/courier invitations
  - API endpoint updates
  - Full feature list

Stage Summary:
- In-app update system fully implemented in v3.3 APK
- API endpoints created: /api/app-version (GET/POST), /api/app-version/download (GET)
- APK built: PickupJamaica-kiosk-v3.3.apk (3.0MB, versionCode 7)
- SHA-256: 8f5d217220ce8f0a76ffd5c4f06004dedd6aa5040840e21d63e78479ec54f6fb
- README.md fully updated with all current features
- To deploy an update: edit app-version.json, place APK in /releases/, redeploy
