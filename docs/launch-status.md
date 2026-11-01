# Stage 1 launch status — 1 November 2026

Stage 1 is non-paid colour only. The user authorized email-and-password accounts with email confirmation disabled for the dedicated hackathon project; see [the access decision](password-access-decision.md). Email addresses are unverified, there is no email password recovery, and invitation counts are account counts rather than real-person counts. Keep paid features disabled.

Project reference, credentials, and the live password configuration have not yet been supplied or verified. A separate secure database-details handoff is pending; the user may create the project manually, so inspect its identity and organization before any new project creation or migration. No paid infrastructure upgrade is authorized.

Before opening access: apply the migration only to the confirmed dedicated project; configure `mailer_autoconfirm: true`; set the project URL and publishable/server-only keys in the deployment; create separate judge and attendee invites; verify signup/sign-in/sign-out/return, invalid and exhausted invites, last-slot behavior, profile and media isolation for two accounts, upload/deletion races, and a phone/desktop journey. The public alias currently serves the earlier holding page. No model calls have been made.

Deletion clears the profile immediately but retains signed-upload path records until the tokens expire. Cleanup requires a later retry after about two hours and five minutes; the app reports pending until then. Verify this against live Storage before opening access.
