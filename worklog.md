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
