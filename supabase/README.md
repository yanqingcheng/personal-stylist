# Account foundation

Apply the migration only to the dedicated project after checking its identity. For this hackathon, the user explicitly chose email and password with Supabase email confirmation disabled (`mailer_autoconfirm: true`). Email addresses are **not verified**, do not establish real-person limits, and cannot be used for password recovery until a mail provider is configured. Do not offer a manual reset that bypasses account ownership. Invite activation and per-account data ownership remain required. Test signup, sign-in, sign-out and return on the configured project before admitting judges. `SUPABASE_SECRET_KEY` is server-only. The migration has not yet been applied to live Supabase.

Invites start absent. Configure one record per cohort through a privileged SQL session. The digest is SHA-256 of the trimmed, lowercased phrase with hyphens changed to spaces and repeated whitespace collapsed. Never commit phrases. In a protected SQL session with digests supplied privately:

```sql
insert into public.invites(digest,cohort,capacity,active)
values (:'digest','attendee',0,true), (:'judge_digest','judge',10,true);
```

Set attendee capacity deliberately (100 is the enforced ceiling); paid calibration is not required for the non-paid stage. Rotate by updating the digest; revoke with `active=false`. Existing grants remain valid. Disable an account explicitly with `update public.access_grants set active=false where user_id=...`. Initial grants have zero allowance and the paid spending switch is disabled.

Storage is private. A signed upload token can remain valid after an interrupted upload, cancellation or deletion. Every issued path is retained as a lease until at least two hours and five minutes after issuance. Deletion clears the profile and current media, then reports pending while any lease remains; the user must return and retry cleanup after expiry. Expired leases are also cleaned when a user starts a new upload. There is no scheduler. Storage errors leave records for retry. A processing upload that finishes after deletion cannot be attached to the profile. This cleanup behavior needs live Storage race tests before access is opened. Future paid operations require additional deletion and cost reconciliation work.
