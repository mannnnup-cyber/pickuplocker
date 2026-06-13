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
