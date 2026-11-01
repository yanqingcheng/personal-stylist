# Build coordination — 1 November 2026

> **Current authority:** [current decisions and build entry](current-decisions.md). Stage 1 is live and further implementation is stopped. Old credential/setup status, 3D wardrobe exploration and demo timing below are historical: boutique is stretch, and recording starts at 15:30 with first take at 16:00. Preserve only the still-relevant ownership/coordination detail.

> Latest Stage 1 access decision: email and password with unverified email, no email recovery; see [password access decision](password-access-decision.md). Paid features remain off and do not block this non-paid milestone.

User authorised implementation, deployment within existing hosting, GPT-6.1 Sol and Terra leads with bounded subdelegation, creative design and built-in image generation for assets. Earlier planning-only text is superseded. Deadline 17:00 London; aim feature freeze15:30 and submission ready16:30.

Terra leads implementation and integration/release, delegating bounded backend and frontend tasks. Sol is the independent reviewer of ready increments, concentrating on user-visible correctness, privacy, spending and simplicity. Agree shared types and endpoint contracts early; each owns its worktree. Terra is sole integration publisher to main after the lead handoff. Commit and push branch checkpoints promptly. Do not overwrite another worker. Parent Astra remains available for high-level decisions and review.

Use the ONE tracker in the primary project checkout: run br there with --json, claim owner and in_progress, record dependency/interface decisions and validation. Never initialize/import a separate worktree database. Children require a bead, bounded file scope, owner and return check. Only Terra exports and commits shared tracker checkpoints; no worker stages another worker's unrelated changes. A completed implementation with missing live prerequisites remains explicitly unverified, not falsely closed.

Inputs: docs/work-packets.md and execution-spec.md; private stylist-notes at reviewed7f5f43d. Read relevant notes, do not publish private personal fixtures. Factors/evidence remain authoritative; labels derived. Judges must be able to use their own photos and return to saved profiles. Supabase remains selected; user is arranging account access. Provisioning credentials and the OpenAI key remain in ignored local configuration; never print/copy them to Git. No paid infrastructure upgrade authorised.

Latest product decisions: GPT Image2.5 selected (Sunburst editing candidate); Decisions for bounded judgments only where it saves larger calls; GPT for nuance/synthesis; optional GPT-Live concentrated on moodboard feedback. Group and clarify feedback before rendering. Consult current official docs for all APIs. Voice needs bounded session cost plus backend cost inside the same50USD; no unattended open sessions. Start with a working text path. 3D wardrobe exploratory, no 3D explainer requested; do not block complete consultation on it. Keep original public colour-system page as documented unless user changes that scope. App is not named Opal.

Verification: pure colour/evidence invariants; real SQL concurrency and RLS/two-user isolation; idempotency and uncertain spend tests; meaningful mobile/desktop browser journey; actual bounded provider calibration after qualitative Codex confidence, with consenting private fixtures. Total API budget50USD including tests; proposed pools5 development/10 judges/30 attendees/5 contingency. Only Terra runs metered probes to avoid duplicate spending. No paid feature opens to crowd before caps and calibration. No round-count cap; exhaustion pauses rather than approves. Save explicit approval for final editorial.

Demo: <=90 seconds, real working app, one meaningful feedback revision, return to saved profile and concrete Codex contribution. User is prospective demo subject; no public use of personal photos without publication consent. No secret answers seeded into inference. Capture build evidence as work proceeds. Protect15:30 freeze/16:30 handoff and flag feasibility risks early.

Latest user direction: minimise churn and overengineering. Every child brief must have explicit deliverable, file scope and stopping boundary. Tests must protect meaningful user outcomes, not mirror implementation/internal state. Prioritise a complete working journey; use focused evidence, no mandatory review cycles or speculative abstractions. Sol reviews ready changes and reports concrete material defects; Terra fixes and integrates.


## Branch stewardship snapshot — 1 November 2026

Canonical review source is fetched `origin/main`; this snapshot used `5bf30cd`. Local primary `main` is stale and carries shared tracker changes, so it is not the integration source. The active integration checkout owns `lane/sol-build-driver-20261101`; `staging/sol-judges-20261101` matched canonical at this snapshot. Worktree activity can change immediately; recheck before cleanup.

An inventory of 127 local/remote refs and 47 worktrees found 20 non-canonical refs fully ancestor-merged and 93 more patch-equivalent. Public hygiene commit `191f1f2` landed as `13f4aeb`. Patch-ID exceptions need semantic comparison rather than automatic merging:

| Branch suffix / source commit | Disposition against canonical |
| --- | --- |
| `adaptive-colour` / `77429b5` | Superseded by the expanded `lib/colour/adaptive.ts` implementation, which identifies the earlier heuristic. |
| `plan-ready` / `871884d` | Current working agreement contains the updated Sol-led ownership; earlier wording is historical. |
| `sol-generation-progress-20261101` / `2aab7dd` | Integrated with changes as `5ca7d46`, followed by the client timing correction `382d156`. |
| `sol-recording-image-size-20261101` and `sol-recording-desktop-size-20261101` / `2f154f1` | Mobile rules retained inside the larger current recording stylesheet. |
| `typology-walkthrough-20261101` / `cd9d32f` | Superseded by the expanded public walkthrough with 21 Line and 14 Presence profiles. |
| `sol-colour-no-repeat-20261101` / `34b9053` | Palette continuation exists unconditionally in current UI; an extra inline mobile-nav hiding rule differs. Integration owner should assess that remaining hunk against current CSS before retiring this branch. |

Uncommitted work was present in the primary tracker, integration dialogue route, mobile-photo-upload checkout, create-disabled checkout and an untracked body-reference module in the generation-eligibility checkout. Preserve these and ask their owners to return or explicitly retire them; this inventory does not grant authority to stage them.

No worktree or branch was deleted. Kernel process-cwd inspection encountered permission-denied entries, so it could not establish that apparently idle worktrees were unoccupied. Deletion requires current ownership confirmation, complete liveness evidence, clean status and recoverable refs. Keep active worktrees even when their commits are merged. This snapshot records provenance, not an alternative tracker or a claim that all branches are retired.
