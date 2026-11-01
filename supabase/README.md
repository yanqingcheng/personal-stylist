# Account foundation

Apply the migration only to the dedicated project after checking its identity. Configure the exact public origin in `NEXT_PUBLIC_SITE_URL`, Supabase Auth redirect allowlist (`<origin>/auth/callback`), and verified SMTP. Test actual email delivery before opening access. `SUPABASE_SECRET_KEY` is server-only. This migration has not been applied or tested against a live project here.

Invites start absent. Configure one record per cohort through a privileged SQL session. The digest is SHA-256 of the trimmed, lowercased phrase with hyphens changed to spaces and repeated whitespace collapsed. Never commit phrases. For example, in a protected SQL session with `:digest` supplied privately:

```sql
insert into public.invites(digest,cohort,capacity,active)
values (:'digest','attendee',0,true), (:'judge_digest','judge',10,true);
```

Set the attendee capacity only after cost calibration; 100 is the enforced ceiling. Rotate by updating the digest; revoke by setting `active=false`. Existing grants remain valid. Disable an account explicitly with `update public.access_grants set active=false where user_id=...`. Judge promotion is intentionally unavailable until pool accounting and a protected, atomic promotion procedure exist. Initial grants have zero allowance and the global spending switch is disabled.

Storage objects are private. Expired or failed pending uploads require manual cleanup; no scheduled cleanup exists. A signed upload URL can outlive finalization, so final images use a separate random path. Profile deletion is retryable and preserves the access grant and its allowance counters, preventing reset. This stage does not make provider calls; future paid-operation work must extend deletion to reconcile in-flight calls and preserve required pseudonymous spend records before enabling them. The migration and RLS, auth, two-account isolation, and concurrency still need integration tests against an actual Supabase instance.
