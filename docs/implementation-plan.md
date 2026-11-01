# Personal stylist: slice plan

Planning only; implementation remains paused until requested. Updated 1 November 2026.

## Product principle: factors first

Record underlying factors and evidence, not just classifications. A named colour template, Kibbe reference or essence label is a revisable interpretation of that record. Never reconstruct the person from a type label or overwrite mixed characteristics to fit a class.

Retain verbatim user reports, photo observations, hypotheses, factor estimates with ranges/uncertainty and evidence references, contradictions, unmodelled notes, personal preferences and practical constraints separately. Distinguish unknown from neutral. Revision replaces the current interpretation while preserving what prompted the change. Classes may inform initial hypotheses but cannot supply invented observations.

The latest user direction adds multiple lighting-condition photos and a public colour-system explainer. The private design notes remain reference material; do not publish private examples or copy their personal data into this repo. Opal is a personal palette name, not product branding.

## Agreed end-to-end journey

Upload photos → answer quizzes and written questions → see drapes, give feedback and select a colour template → see on-person moodboards, give feedback and select a coherent style and essence → receive an editorial recommendation edit. Users can save unfinished consultations and return. Build incrementally; a live colour journey is the first complete milestone, not the limit of the product vision.

## Slice 0: hosting, invited accounts and saved profiles

Next.js, TypeScript, Tailwind and an independent Vercel project. Holding scaffold deployed; anonymous verification, custom DNS and public Git source remain tracked in stylist-jfn. See [execution contracts](execution-spec.md) and [work packets](work-packets.md) for the implementation-ready detail. Supabase is now planned for Auth, profiles and usage accounting: this supersedes the original memory-only plan.

- Require authenticated, invite-activated accounts before any paid AI operation; landing and explainer can remain public.
- One memorable shared attendee phrase activates at most 100 distinct accounts; live capacity will be lowered to fit measured costs within the $50 total API budget. A separate judges invite has an independent capacity, so attendee exhaustion cannot block judge activation. Budget split, measured allowances and capacity follow execution-spec R4; judge phrase and capacity are independent.
- Proposed auth default: verified email. Sign-in method and delivery setup must be checked before implementation; 100 accounts does not establish 100 unique humans.
- Treat invite phrases as shareable access codes, store a simple normalized digest, redeem server-side in a transaction, enforce unique account redemption, expiry/revocation and atomic capacity checks. Retried redemption must not consume another slot. Do not expose invite codes in source, logs or public client configuration.
- Enforce per-account credits, request/concurrency limits and a global budget at every model/image endpoint. Reserve a conservative cost allowance atomically BEFORE a provider request, then settle actual usage; use idempotency keys and reconcile uncertain failures without refunding possibly spent calls blindly. Client counters are display only.
- Reserve a separate judge budget within the total project cap so attendee spend cannot exhaust the demo allowance; judges still have finite limits. Global emergency cutoff applies to everyone.
- Save factors, evidence, selected colour template, preferences, moodboard rounds/feedback, current step and approval state. Use account-owned database rows with row-level access policies. Portraits and generated boards need private storage and controlled access to support resuming; disclose storage and cloud processing, and implement deletion.
- Verify concurrent last-slot redemption, expired/revoked code, duplicate retry, unauthenticated/direct endpoint calls, two-user data isolation, concurrent credit exhaustion, and cross-device resume. No paid endpoint goes live before these controls work.

Supporting docs: https://supabase.com/docs/guides/auth ; https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/storage/buckets/fundamentals .

## Slice 1: complete colour consultation

### 1. Evidence and atlas contract

Implement a versioned colour-session model: photos with lighting/context notes, selected reference photo, written reports, quiz answers, drape responses, photo observations, hypotheses, three continuous factor estimates, taste preferences and derived template candidates. Temperature, value and chroma are the core factors; natural facial contrast is supplementary. Unknown is null, never zero. Keep immediate UI state locally and save authenticated profile checkpoints through the slice-0 persistence boundary. Refresh/sign-in must restore progress. Provide explicit reset/delete and a downloadable text/JSON profile excluding photos.

Import only reviewed nonpersonal taxonomy data with provenance: exactly 31 templates, including the traditional twelve. Map factor evidence to template candidates; incomplete or contradictory evidence must not yield a definitive class. User-selected comparisons with other templates are exploration, not new evidence about their body. Store the user-selected template separately from inferred candidates and factors; choosing a template never overwrites evidence.

### 2. Multiple-photo intake and quiz

Accept multiple portraits, each with optional lighting, makeup/hair-dye and context notes. Proposed practical limit: four photos, with one sufficient to continue. Select one reference for each drape comparison. Show preview, replace/remove, supported formats, upload errors and a size limit. Do not silently combine lighting conditions into a supposedly calibrated image.

Require two short written reflections about flattering colours and disliked/unflattering colours with reasons. Keep perceived effect on the face separate from desire to wear the colour. Add a concise optional structured quiz with unsure/skip choices; preserve original answers and allow edits. No inferred demographic traits or body measurements.

### 3. Same-photo draping

Use the canonical eight trial pairs as the initial sequence. Show identical source pixels/crop/size on both sides; change only a surrounding or adjacent colour panel. A/B/both/neither/unsure, comment, Back and early finish. Allow retrying a trial with another lighting reference and retain which photo each answer concerned. Prioritise unresolved axes after the basic loop works. Conflicting photos or votes remain contextual evidence, not an automatic neutral average.

### 4. AI observation and explanation

After the local journey works, add server-side OpenAI observation and reasoning with explicit opt-in before sending photos/text. Verify current SDK/API docs then, validate structured output and evidence references, reject invented template IDs. Separate what is visible from interpretation, report confounders and uncertainty, and never regenerate the draped portrait. Keep API keys server-side. Bound photo sizes, request count and output; set timeout and basic public endpoint abuse controls before enabling paid inference.

Failure preserves the session and provides retry or an honestly labelled manual path. No key or model failure must look like successful analysis. No raw photo/request logs, no unsupported retention promises. A seeded demo is separate and conspicuously labelled.

### 5. Template, personal palette and result

Offer the closest supported named template and alternatives; if evidence is insufficient, explain what remains unresolved and let the user explore candidates. Show the factors and why they were inferred alongside the label. A named type is not the only saved output.

Separate Love/Fine/No thanks taste filtering from flatteringness. Preserve full template neutrals and accent families; personal exclusions may leave gaps, which are disclosed rather than silently reintroducing rejected colours. Include a light-shirt and dark-bottom combination when permitted by the personal subset. Export factors, evidence, uncertainty, candidates and preferences without photos. Edit answers, repeat drapes and reset remain functional.

### 6. Colour-system explainer

Public /colour-system page linked from intake and results. Explain temperature/value/chroma, neutral versus unknown, continuous factors versus named templates, how 12 conventional seasons sit inside 31 proposed regions, full wardrobe roles and taste versus harmony. Include labelled examples and a browsable template list if inexpensive. Clearly identify the expanded taxonomy and HEX palettes as provisional design proposals, not validated diagnoses. Use reviewed public references and credits; no private brainstorm links required to understand the page.

### 7. Verify and release

Meaningful tests: 31/12/19 taxonomy and full wardrobe roles; unknown/both/neither/conflicting evidence; exclusions leave factors unchanged; invalid AI data and failures; same-photo drape source and transforms; replacing/removing reference photo; session reset. Browser acceptance on phone and desktop: upload multiple test images, choose reference, answer/edit/skip, drape, obtain supported result or honest ambiguity, exclude a colour, export, visit explainer. Use generated nonperson test fixtures and private consented demo portraits outside Git.

Finish with public anonymous link checks, reproducible setup, provenance, a concrete Codex contribution and a demo video at most 90 seconds. Keep 15:30 onward for testing/demo/submission preparation, with 16:30 as the submission-buffer start. If behind, cut adaptive ordering and atlas browsing before dropping evidence separation, honest uncertainty or the complete journey.

## Slice 2: joint style, body-line and essence consultation

One moodboard-and-feedback experience, not separate Kibbe then essence verdict screens. Preserve distinct evidence internally where useful. First design the factor vocabulary using real examples; do not invent a complete classification grid in advance.

For body lines, proposed factors describe specific features: shoulder breadth/slope/angularity, apparent vertical, torso and limb proportions, local contour/softness, feature scale, and garment construction interactions. Use concrete names and context, not a global yin/yang score or a mandatory binary per feature. Some qualities are multidimensional; measured height, perceived elongation and clothing-created vertical differ. Measurements are user reports, not camera-derived precision.

For essence, retain holistic descriptions alongside tentative descriptors (for example geometric vs flowing detail, ornament scale, symmetry, texture or desired playfulness). These are design hypotheses to test, not established independent psychological axes. Separate observed impression, user aspiration, preference and stylist interpretation. Nonfactorable phrases remain first-class evidence. Labels may summarise; they never replace the description.

Inputs include full-body/reference outfits where relevant; self-reported sizes/proportions and changes over time; five written reflections (successes, failures, loved aesthetics, former favourites, desired impression); garment-feature inventory and practical needs. Select garment domain explicitly; menswear is the notes' initial adult emphasis, without forcing suits or ties. Other adult wardrobe domains need relevant questions. Child essence is a separate later pathway with no body typing.

Show several coherent, genuinely different diagnostic looks on the actual user's face and figure. Gather whole-board, item and attribute feedback, with unrestricted text. Distinguish looks harmonious, like it, would wear it, and rendering error. Translate liked features into alternatives rather than assembling every liked fragment. Illustration defects must not update body factors.

**Iterate until the user is satisfied. No fixed round count, automatic confidence cutoff or forced approval.** Save every round and allow return later. When credits run out, preserve the unfinished consultation and clearly explain the limit; never mark it settled or generate a pretend final result. User approval is explicit and can later be revised.

Done: feedback produces a materially revised coherent board, rejected details stay rejected, corrections preserve evidence, and the user can pause/resume and choose their style/essence when ready.

## Slice 3: editorial recommendations

After explicit satisfaction, produce a glamorous final editorial of the agreed individual style, contrasting with the diagnostic boards. Include portable colour/style grammar, construction, fabrics, details, exceptions and illustrative outfits. For shoppable recommendations, verify actual retailer, image, price, available size evidence and link; record check time. No invented products or disguised demo inventory.

Each recommendation must satisfy visual harmony, aesthetic affinity, practical suitability and wardrobe complementarity separately before ranking. Gather budget, market, occasions, comfort/material constraints, wardrobe gaps and duplicates. Failed live sourcing should yield an honest style-only editorial, not pretend purchasable pieces. Prefer a small strong edit.

## Source material staged for each implementation phase

Private reference checkout: sibling `stylist-notes`, reviewed at commit `7f5f43d`. Fetch for awareness because the research agent is adding material; implement from this reviewed pin until any new delta is reviewed. Do not copy private personal examples into this public project.

- All stages: `docs/00-decisions-and-status.md`, `05-corrections.md`, `09-complete-product-requirements.md`, `02-style-engine.md`, `13-data-and-agent-contracts.md`; history's chronological decisions confirm the multidimensional Terra Ignota inspiration. Superseded files are not runtime input.
- Intake/journey: `01-user-journey.md`, `10-colour-first-mvp.md`, `11-site-design.md`, `17-phase1-design-checkpoints.md`.
- Colour runtime: `data/opal-atlas-31.json` (types, coordinates, crosswalk, role palettes, eight drape trials, secondary questions and preferences); `03-colour-system.md`, `20-colour-mvp-engineering-contract.md`, `21-colour-quiz-regression-spec.md`; observer/reasoner prompt files; `scripts/colour_trial_logic.py` and tests as reference logic, to credit if reused.
- Adaptive draping: new `22-eval-informed-drape-design.md`; use disputed axes and different hue families to inform next trials. Unknown/both/neither/conflicts retain their semantics. Published celebrity claims do not establish true labels or justify new classes.
- Explainer: canonical taxonomy and crosswalk, `07-12-season-reference-study.md` for wardrobe roles, atlas SVG/HTML as design references only. The older study's 15-new-cell and distinct-coarse-cell language is superseded by the current 31-class construction; do not copy it uncritically. Strip obsolete product branding.
- Style/moodboards: `01`, `02`, `09`, `15-audience-pathways-men-and-children.md`, `16-menswear-research-to-feature-map.md`, `18-feature-module-boundaries.md`. Private demo-person material may inform private tests only; use fictional public fixtures.
- Editorial: `01`, `02`, `04-hackathon-brief.md`, `09`, and current retailer/API docs at implementation time. Full product brief is vision, not permission to skip staged delivery.
- Evaluation: `19-eval-research-protocol.md`, `evals/source-claims-audited.json`, `axis-disagreement-matrix.json` and audit prose. These are attributed claims/stress tests, not training truth. No scraped portraits or celebrity identity leakage into blind prompts.
- Validation at reviewed revision: atlas validator passed, all 16 Python preparation tests passed. This verifies structural rules, not styling accuracy.

## Delivery risk and checkpoints

The complete vision plus hosted accounts, image generation and shopping is ambitious for six hours. Ship invite-gated saved colour consultation first, then a working iterative moodboard loop, then editorial sourcing if time permits. Keep the full product sequence visible in planning without fake working buttons. Protect the demo/submission buffer. Auth email delivery, image fidelity/latency and live product sourcing are concrete early checks.

Commit and push meaningful checkpoints as requested, including beads JSONL and this plan. Never rely on this workstation's session memory. No secrets, invite values, personal photos or private notes in Git.

Readiness update: $50 API cap approved. Test qualitatively in Codex first, then meter a small API calibration and size actual admissions from cost. OpenAI key safely configured locally; Checklet Supabase token requires refresh. Implementation remains paused until go.
