# Work packets for “go”

Read [execution-spec.md](execution-spec.md) (R0–R9) and [implementation-plan.md](implementation-plan.md) first. These files govern over older bead prose where they conflict. Implementation authorised by the user on 1 November 2026. Scope is the complete journey, delivered in working checkpoints; no assumption it all fits before17:00.

Each packet below is an execution-task unless labelled decision/test-charter. Its input is this repo plus the specified R-sections and the source map in the implementation plan. Private source checkout can be obtained from `yanqingcheng/stylist-notes` using authorised access; pin reviewed commit7f5f43d, review later deltas before adoption. No private photos or personal examples enter public source. Missing credentials do not prevent pure domain/UI work.

## P00 — launch configuration and feasibility (decision + bounded experiments)

Depends: none. Owner: lead implementation agent; account owner supplies fresh Checklet Supabase access when needed.

Inputs: R0,R4,R8; authorisation to retrieve OpenAI key from local secrets; $50 total. On a replacement workstation configure secrets through its secure store, never this document. Existing key is only in primary ignored .env.local, not copied to worktrees or Git.

Output: `docs/launch-status.md` updated with project reference (nonsecret), auth method, callback URL, chosen models/settings/prices, approved pool allocation, image latency/fidelity result, usable live account capacities, unresolved prerequisites. This is two phases, not a cyclic whole-packet prerequisite: P00a setup/qualitative decisions unlock P02; P00b metered calibration depends on P03, P05 owned upload/finalize/read capability and the P09 LookSpec contract. It owns a minimal provider probe harness through the paid wrapper; it does not depend on completed P07/P10 screens. P10 live acceptance follows this probe. First get qualitative Codex experiments working; then begin API metering only through the spend wrapper P03. Probe costs count inside proposed $5 development allocation. Verify private consenting reference availability; no arbitrary public-person photos.

Auth: fresh management token for Checklet account; inspect organisation/project slot, create dedicated personal-stylist project only when go authorises setup. Check region/plan before accepting paid infrastructure; ask before a paid upgrade, since $50 authorises API spend only. Reuse authorised configured SMTP/OAuth infrastructure if available; don't extract another app's OAuth secrets without explicit need/authority. OTP delivery test to non-team account, or supported OAuth end-to-end. Check venue shared-IP rate limits.

Done: facts recorded, secrets locally/provider configured without exposure, every unsupported capability has honest fallback and affected feature disabled. If auth fails, continue P04/P08/local schema but do not open AI. If on-user image fidelity fails after a bounded alternative trial, report the missing core capability, retain working colour journey; generic people/garment collages cannot be passed off as on-user success. If shopping fails, text editorial remains valid without fake products.

## P01 — hosted foundation and source recovery

Depends: none. Tracker: stylist-jfn.2/.3/.4. Inputs R0,R8 and README.

Verify exact assigned alias `https://personal-stylist-mauve.vercel.app` anonymously in browser and mobile; do not use unrelated personal-stylist.vercel.app. Custom domain: only stylist CNAME to `d59132773aeaf1d7.vercel-dns-016.com`; preserve apex/www. DNS may remain pending without blocking alias. Confirm clean clone `npm ci`, lint/build/start, public repo access and README actual behaviour. Document how to set env and resume beads. Remove unused scaffold flags/assets only if they impede the actual app. Next docs under installed node_modules govern current conventions; avoid caching authenticated data. Done: owned URL works without Vercel protection and source recoverable; custom DNS status explicit.

## P02 — account/invite and database foundation

Depends: P00 auth/project configuration (not the image probe). Tracker stylist-jfn.5. Inputs R1,R2,R3.

Deliver migrations for account activation/invites/profiles/media/rounds/operations/pools, RLS and role grants; auth callback/login and invite entry; manual operator commands for phrase rotation/account disabling/known judge promotion. Implement atomic normalised phrase redemption and immutable server authority. Database schema supports P03/P05, but this packet doesn't implement all their UI.

Done tests: simultaneous final slot, duplicate same-account activation, judge success with crowd full, no automatic cohort upgrade, bad/revoked phrase errors, unactivated/anonymous blocked, forged client role denied. Actual auth login/logout/callback verified. A connected but untested schema is not completion.

## P03 — paid operation and budget boundary

Depends: P02 schema and $50 setting from P00. Tracker stylist-jfn.6. Inputs R4.

Implement reserve/dispatch/settle once, server-only SDK wrapper, payload bounds, status endpoint, account/pool concurrency, disjoint test/judge/attendee reserves, emergency disable and operator uncertain-call reconciliation. Configure all paid endpoints through it. No unbounded raw-prompt route. Mock transport tests are appropriate for concurrent/ambiguous failure simulation; they are not evidence of live provider success.

Done: concurrent requests cannot exceed caps; same key returns one operation; replay changed payload fails; uncertain calls retain financial reserve; refused/invalid paid result accounted; paused UI retains feedback; judge financial reserve untouched by crowd. Run a bounded actual API call only after tests and user go. Missing current prices or unknown max cost disables that model. Log metadata/usage only, no faces/text/secrets.

## P04 — canonical colour domain

Depends: none; can run in parallel with infrastructure. Tracker stylist-l8d.1. Inputs R5 and source map.

Deliver sanitized atlas with source revision/credits, typed factor/evidence schemas, deterministic trial reducer/candidate ranges and palette preference functions. Port only understood prototype rules, fixing contextual repeat/neutral-candidate gaps. All31 candidates remain explorable; observed neutral distinct from broad/unknown. No invented coordinate truth.

Done:31 unique/12 embedded/19 additional; full neutral and accent roles; unknown/both/neither/conflict semantics; no double-counted repeated trial; Black Opal remains selectable without coaching inferred result; taste changes no factors; source words preserved. Test boundary cases and candidate-empty path. Exact inferred neutral is not promised by directional quiz alone.

## P05 — saved profile/media and restoration

Depends: P02; consumes P04 colour schema when integrating colour fields. Tracker stylist-jfn.7. Inputs R3.

Deliver owned direct upload/finalization/deletion, schema-versioned profile API and expected-revision saves, current-step/pause state, saving indicator, restore/signout, private media reads and photo-free export. Server rejects forged immutable fields. Implement deletion with late-result tombstone protection. No profile reset resets allowance.

Done: two-user data isolation including media and jobs, cross-device restore,409 preserving drafts, broken/oversized upload, unsupported HEIC, replacement keeps source provenance, pending/failed cleanup honest. Delete removes app rows/assets and does not claim provider deletion. Save loop remains usable when credits exhausted.

## P06 — complete colour UI

Depends: P04,P05. Tracker stylist-l8d.2/.3/.4. Inputs R5, source UX docs.

Implement multiple-photo selection, lighting notes, required written reflections/short quiz, same-pixel drapes with stored A/B mapping, editable comments and back/skip/early finish, template comparison and explicit selection, separate taste filters, full palette plus missing-role gaps. Clear states for loading, save failure, unknown evidence and conflicts. Copy says provisional. Responsive neutral UI during draping.

Done: uploaded reference visibly unchanged both sides; repeat with alternate lighting retained contextually; no answers produce no forced diagnosis; user selects template without mutating factors; rejecting a shirt swatch doesn't secretly restore it; reload resumes; mobile/keyboard completion. This is the first usable core product, deploy it while later packets continue.

## P07 — qualitative AI observation/reasoning

Depends: P03,P04,P05; live use also P00 model probe. Tracker stylist-l8d.5. Inputs R4,R5 and observer/reasoner prompts.

Deliver structured observation and reasoning adapters with schema/allowed-ID/evidence-kind validation, explicit cloud disclosure, qualified explanations and revision-checked application. API sees owned media and typed task, never client-selected model/tools. Failed AI preserves deterministic manual flow; labelled seeded demo never masquerades as analysis.

Done: unknown/lighting/dye caveats, taste cannot mutate colouring, bogus IDs/source references rejected, refusal/network timeout handled/billed correctly, late answer cannot overwrite changed profile. This enriches the colour journey but is not a prerequisite for local draping to work.

## P08 — public explainer

Depends: P04 taxonomy. Tracker stylist-l8d.6. Inputs R5 and source map.

Deliver /colour-system: three continuous factors, templates as summaries,12 inside31, practical hue/neutral roles, uncertainty, taste distinction, original/derived palette credits. No old39 system or Opal app branding. Link from consultation/results. Done: usable without account, accessible swatch labels, correct canonical crosswalk, no private notes links required, claims honest. Atlas browsing optional.

## P09 — joint style intake and hypothesis contract

Depends: P04 schema. Can design during infrastructure setup; live saving depends P05. Tracker stylist-koo and new style intake task. Inputs R6, notes09/15/16/18.

Deliver authored short question packs for garment domain, full-body reference request, successes/failures/loves/former favourites/desired impression, practical context and optional regional/essence quiz. Unknown/skips permitted for measurements; compulsory prose can be one sentence. Concrete regional descriptors plus unrestricted essence prose; no global score or new ontology project. Define versioned LookSpec and evidence-type validation before generation.

Done: fictional worked examples demonstrate different local features coexist, garment choice not inferred from gender, rendering errors cannot support body-factor update, desire and observed impression separate. Adult-only experience; no child route. Full-body requirement made explicit before claiming on-user figure rendering.

## P10 — on-user moodboard generation

Depends: P03,P05,P09; integrate chosen colour from P06; enable only after P00 fidelity/latency test. Inputs R4,R6.

Deliver LookSpec planning/validation, bounded generation adapter, immutable round/media/job records, visible pending/failed/uncertain/stale states and “what changed and why”. Start2–3 coherent looks, chosen based on measured cost. Verify deployment duration and await call; no unsupported fire-and-forget. A generated artifact is not automatically current or approved.

Done: actual consenting reference yields recognisable face/approximate figure and a usable diagnostic board, one material revision renders, costs recorded; old-revision and deleted-profile jobs don't overwrite/resurrect; double-click/reconnect not double billed. This capability cannot be certified by mock images or a stranger collage.

## P11 — feedback, iterative refinement and satisfaction

Depends: P10 (UI can co-develop against LookSpec). Inputs R3,R6.

Deliver board/item/attribute feedback and free prose, reversible interpretation, “refine” / “try a different direction”, save/resume all rounds, explicit satisfaction against chosen round/revision, reopen after approval. No round cap. Stop/credits exhaustion only pauses. Respect rejection and retain appealing attributes in coherent new construction. Paid retry uses explicit operation identity.

Done: love texture/hate neckline changes neckline while preserving texture; drawing error changes rendering notes but not body factors; a seventh round is permitted if funds allow; exhaustion saves unsatisfied draft; different device resumes; changing colour makes prior style/editorial stale; only explicit current approval permits editorial.

## P12 — final editorial and optional sourcing

Depends: P11 approval plus P03 paid wrapper (if any). Tracker stylist-iwx.1. Inputs R7.

Deliver polished textual personal grammar and selected looks first, optional glamorous image if allowance remains; text editorial allowance ring-fenced. Add bounded sourcing probe only after core loop works. Real product cards require retailer/link/price/time and known availability limits, grounded in all four circles. Style-only output is clear if shopping unavailable.

Done: unapproved/stale inputs rejected; approved grammar reflected; dislikes/practical failures not compensated by beauty; no fabricated prices or product links; model/network failure keeps approval and resumable editorial pending. Missing image hero must be explicit rather than pretending diagnostic art is final generated imagery.

## P13 — integrated acceptance and release (test-charter + execution-task)

Depends: P01,P02,P03,P05,P06,P08 for colour checkpoint; additionally P11/P12 for full journey; P07 checks are conditional on photo-observation feature being enabled. Colour checkpoint can be released earlier with honest scope. Inputs R0–R9.

Deliver test evidence, tested live URL, setup/provenance, recorded <=90-second actual working demo and concrete Codex contribution. Use a private consented portrait at demo time; do not publish identifiable photos without permission. A fictional prerecorded example is labelled and does not certify live on-user generation. Public explanatory/demo material must not require an invite; actual paid consultation intentionally does.

Check fresh attendee account, crowd exhaustion/judge admission, auth/shared-IP viability, mobile/desktop whole journey including revision and resume, two-account isolation, endpoint caps and failure states, public source and links. Stop feature additions at15:30, use16:30–17:00 for submission. If schedule slips, drop shopping/atlas browse/adaptive ordering/decorative image polish before core loop or access/spend controls. Report incomplete stages honestly.

## Execution lanes and checkpoints

- Lane A: lead owns P00/P01 and Supabase migration/credentials; sequence P02 → P03/P05.
- Lane B: colour domain/UI owner starts P04, then P08 and P06 once persistence contract ready.
- Lane C: style owner authors P09 and prompt/LookSpec qualitative examples, then P10/P11 after shared contracts and paid gate.
- One integration owner merges tested work, applies migrations and deploys. Use independent worktrees from origin/main; never let workers overwrite shared generated files or .beads SQLite. Primary checkout owns tracker writes. Each packet commit/push includes its tests and truthful state.
- First checkpoint: invite/save/restore plus nonpaid colour; second: live selected colour → one on-user board → revised board; third: approval → editorial. No need to perfect each stage before connecting the next, but do not bypass security to demo it.

## Recovery on another workstation

Clone public repo, read this file + spec + latest review record, `npm ci`, import beads JSONL. Private source repo and secrets need separately authorised access. Configure app env using .env.example (names only), verify correct Vercel project and dedicated Supabase reference before migrations. Check existing deployment and operation states before restarting anything; don't repeat paid uncertain requests. Continue ready packets without replaying already-completed work.
