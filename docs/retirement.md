# Hackathon retirement — 1 November 2026

Feature development ended at the owner's request. The last completed application change is `b3d6ab4`, including the already-tested mobile result-context patch. Its TypeScript, scoped lint and production build passed. Public and explicitly synthetic screenshots were captured before retirement; see [their provenance](screenshots/README.md). No paid model tests were made during wrap-up.

## Hosting and paid services

Only the Vercel `personal-stylist` project was targeted. The CLI refused non-interactive project pausing and required a human to type the project name; that confirmation was not automated. The authorised fallback was deployed instead: a static archival landing page, with no application functions, using the [preserved HTML and build-output configuration](../ops/archive-site/index.html).

Archive deployment: `dpl_Hy3WawpqecL1Aqy3m7nUxbkLM3WB`. On `https://stylist.qingsworkshop.com`, `/` and `/style` returned HTTP 200 with the archive page. GET/POST generation, GET Live and POST neutral-reference paths returned HTTP 410. This is a static retirement, **not a paused-project claim**. DNS, other projects, keys and historical deployments were not deleted or changed. Historical deployment URLs have not all been retired individually.

The shared ledger's `budget_control.emergency_disabled` switch is true, preventing new paid reservations, including through retained app deployments. The transaction checked that 30 other public/auth/storage tables stayed unchanged. There were no running/reserved operations or open Live sessions to close. All five recorded Live sessions were already closed.

The USD 100 authorised ceiling, USD 4.191291 usage-priced estimates/conservative upper estimates, and USD 6 in uncertain reservations were preserved. The estimate is not a provider invoice, and the holds were not released. All nine profiles/auth accounts, 58 media records and 59 stored objects were retained. No account was reset or deleted.

The four specified preview listeners on ports 3213, 3214, 3223 and 3224 were stopped with SIGTERM after checking each listening PID, owner, command and working directory against the intended fixture/server. None remained listening afterward.

## Preserved work and restoration

No branches or worktrees were deleted. The wrap-up inventory inspected 66 worktrees. Four had tracked changes, retained in place:

| Branch | Preserved tracked changes |
| --- | --- |
| `main` in the primary checkout | `.beads/issues.jsonl` |
| `lane/sol-build-driver-20261101` | `app/api/style/dialogue/route.ts` |
| `fix/mobile-photo-upload` | `app/globals.css`, `app/profile/page.tsx` |
| `fix/create-disabled-reason` | `app/style/page.tsx` |

Fifty-six checkout heads contained commits not directly ancestral to the canonical line; this includes cherry-pick equivalents and does not mean 56 unfinished features. Their content was not silently merged or discarded. The detailed local inventory remains private.

The final app deployment and source remain available for deliberate restoration. Restoration requires a new decision to reopen access, a review of active/uncertain operations and configuration, and deliberate release of the emergency switch. The archive itself does not authorise a relaunch or further paid tests. The owner will handle DNS separately.
