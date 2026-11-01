# Silhouette evidence and validity review

1 November 2026. Read-only source and native visual review at fetched `origin/main`
`e9ef0ae`; rechecked against canonical release candidate `c653b49` in
`personal-stylist-wt/sol-judges-candidate`. Corrective commits `aadb305`, `4bbf39c`
and `c653b49` were inspected (original worker commits `334826a`, `4e1e5d7`,
`31c4531`).
No paid calls, owner-data changes, deployment or new approval were performed.

The implementation supports provisional garment experiments with separated evidence.
It does **not** establish a validated body typing instrument, a derived Kibbe
profile, or the predictive accuracy of the 21 proposed Line profiles. The four
proportion questions reach the recommendation inputs; this is an implementation
finding, not evidence that the recommendations reliably use them well.

## Actual evidence path

| Step | Source and finding | Limit |
| --- | --- | --- |
| Original body selection | `lib/body-reference.ts` loads an approved, adult-confirmed, owned, ready `body_reference` for the active profile; returns original provenance and selection revision. | Full-body confirmation is a user report, not pixel verification. Approval is of the original reference, not of a body classification. |
| Proportion questions | `app/style/proportion-questions.tsx` saves original statement, A/B/both/neither/unsure answer, question ID, provenance and time under `answers.bodyProportionAnswers`, with revisioned merge. | Four observations only: overall vertical impression, torso/leg relationship, shoulder breadth, shoulder edge. There is no comprehensive measurement or regional scoring system. |
| Dialogue | `lib/consultation-provider.ts` supplies the saved answers, vibe, reflections and intake separately, plus owned body pixels when available. Its instructions distinguish user report, image evidence and aspiration. | Live voice itself receives metadata; backend visual delegation must supply actual pixels before claiming inspection. |
| Domain | `lib/style/server/provider.mjs` selects menswear, womenswear or mixed from explicit intake. Mixed mounts relevant tools from both blocks. | Garment workflow does not identify gender. No domain establishes a universal body taxonomy. |
| Planner | `lib/consultation-generation.ts` sends `userProportionReport`, `userVibeReport`, intake, original body image and relevant exact parent/silhouette pixels. The schema restricts observations to `reference.photo`; report IDs are permitted only for hypotheses and reasons. Missing reports cannot be cited. | Source-ID existence checks do not prove semantic faithfulness. A model could ignore a present report or misdescribe an image while returning valid JSON. |
| Renderer | The actual saved evidence and validated plan are serialized into the render request; image roles distinguish original body from generated garments. | The renderer can still distort proportions, omit construction details or print unjustified claims. Generated bodies cannot update original body evidence. |
| Critic | Baseline receives original and generated pixels, plan, messages, feedback and palette. `334826a` adds original proportion/vibe/intake/reflection reports and explicit uncertainty instructions. | Baseline could miss an intake-only ban or a proportion answer omitted by the planner. Corrective wiring closes that input gap; it does not establish critic accuracy. |
| Editorial | `app/api/consultation/actions/route.ts` resolves exact owned output/hash and application approval, attaches approved sheet pixels, and passes consultation context containing reports. | The optional second image is a colour portrait, not necessarily the selected body original. Editorial must remain garment explanation, not fresh body analysis. |
| Profile summary | `app/studio/page.tsx` labels saved proportion selections as user reports and keeps vibe expression separate. | It does not calculate or save a Kibbe identity. “Unsure” stays an explicit unknown. |

The proposed catalogue in `docs/typology-walkthrough.md` is richer than the current
four-question UI. Its regional geometry and garment-response entries are useful
design hypotheses, not equivalent measurements. L18/L20 construction response
cannot establish anatomy. “Balanced” needs positive evidence of regional moderation;
opposite local extremes do not cancel. No global yin–yang total, label assignment,
personality inference or hidden-region inference is warranted by this implementation.

## Concrete findings and bounded corrections

1. **Critic input loss:** original reports and intake were absent from critic input
   at the baseline. Independently inspected `334826a` supplies all four evidence
   groups and says the plan may omit saved requirements. This is the necessary
   minimal fix; retaining only the plan would make the critic dependent on the
   planner's omission.
2. **Contradictory mounted prompt:** `prompts/style/plan.md` stated USD 50, required
   full-body/selected-palette prerequisites, and prohibited combined domain blocks.
   Runtime consultation already had narrower scope overrides and mixed-domain
   assembly. Independently inspected `31c4531` defers to authoritative caller scope
   and configured backend budgets, permits garment-specific mixed reasoning, and
   shares regional independence across domains. It changes no budget or eligibility
   guard. `4e1e5d7` additionally separates incidental reference clothes from taste.
3. **Optional-question UX mismatch remains:** dialogue calls proportions optional,
   but stage five advances only after four saved answers. “Not sure” permits an
   unknown answer; there is no skip-all action in `ProportionQuestions`. Keep this
   distinction explicit until a UI owner implements genuinely optional continuation.
4. **No evidence of a derived regional profile:** current reports flow to prose
   reasoning directly. Do not describe the catalogue, optional shorthand, or four
   questions as a deployed validated classifier.

## Independent native review of the existing synthetic sheet

Viewed the existing fictional original `private/fixtures/synthetic-full-body.png`
and `private/synthesis-trial-output.png` in the older integration checkout (used only for existing artifact access). Read the
adjacent `private/synthesis-context-trace.txt` for dispatch limitations. These private
artifacts are not added to this document or committed by this review.

Four visibly distinct complete outfits are present: teal open-neck top with pale
trousers; coral scoop-neck top with smooth olive flared skirt; blue open-neck long
dress; open coral overshirt with light shell and olive tapered trousers. They have
different continuity, layering and volume relationships while remaining coherent.
The sheet has no visible unstyled-source inset or before photo. The fictional face
remains recognisable. Clothing covers body contours differently, so this inspection
does not establish exact body preservation, fit or measurements.

The sheet's printed “All wool-free” and “comfortable movement” exceed what pixels
can verify. Wool exclusion is an input requirement for eventual garment selection;
comfort is a proposal to test. Fabric texture is suggested visually but composition
is not established. This does not require rejecting an otherwise useful concept,
but neither the illustration nor editorial should certify those properties.

The recorded trial had **no selected palette, no proportion answers, and no Kibbe
type**. Colours came from synthetic preference history. It can illustrate garment
continuity and four-look composition; it cannot validate palette adherence,
proportion-answer influence, body typing or real-person satisfaction. It remains
unapproved final synthesis. This review made no new approval.

## Complete fixture and quality checks without paid calls

Use the real generation handler with isolated in-memory service/provider boundaries,
not production accounts. Capture outbound planner, renderer and critic inputs.
Return deliberately controlled provider responses. This checks application behavior;
it cannot measure how the real model reasons or renders.

| Scenario | Required observable check |
| --- | --- |
| Complete saved input | Approved owned partial original; selected atlas palette with one exclusion; all four original answers including an unsure; recognisable/aspiration/avoid vibe; intake-only hard ban; garment domain; original feedback. Assert exact reports, provenance, allowed colours and image-role order reach each relevant call. |
| Planner drops a requirement | Return a schema-valid plan that omits the intake-only ban and report. Assert critic still receives original reports independently; a controlled rejection must prevent upload/publication and preserve feedback. |
| Report absent | Omit proportion/vibe answers but return a plan citing their source IDs. Assert image dispatch is prevented; never synthesize a default body profile. |
| Crop contradiction | User calls reference full-body but planner reports portrait. Body-concept/full-body must not render hidden body; a partial-body original remains eligible for explicitly scoped concepts. |
| Mixed construction | Explicit mixed request for supported jacket plus fluid skirt retains both relevant construction tools, independent local observations and user taste. No inferred gender or universal average. |
| Different evidence kinds | Broad shoulder report, fine wrist observation, desire for romantic clothing, and a liked crisp jacket remain separate. Unsupported wrist/leg observations are not generated from the shoulder answer. An “unsure” shoulder edge is not converted to moderate. |
| Rendering complaint | “You widened my shoulders; same jacket” changes fidelity instructions, not body facts or clothing preference. Keep exact parent image and original source distinct. |
| Source changes | Change the selected body revision after planning. Assert no render uses stale original approval. |
| Synthesis continuity | Saved silhouette image and hash arrive as garment evidence, original as body evidence; reject-all is not approval and prior stylist suggestions are not user likes. |
| Approval/editorial | Exact output/hash approval is required. Editorial receives original user words, marks material/comfort/fit unknown, and does not derive a type from generated pixels. |

For future real-model evaluation, score separate outcomes: faithful use of each
original report, an explicit garment mechanism, preservation of uncertainty,
independent regional evidence, visual fidelity, and user appeal. Do not combine
these into a taxonomy-accuracy score. A no-cost handler fixture proves transport
and guards; only appropriately designed visual comparisons and user feedback can
test whether the hypotheses are useful. No such empirical validation is claimed here.
