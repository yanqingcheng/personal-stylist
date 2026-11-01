# Renderer goals and preservation rules

1 November 2026. Prompt/context implementation review, not a successful paid-render evaluation. All paid release gates remain off. No provider or image-generation call was made for this change; no private images or personal baseline were added to Git.

## What changed

`paid.ts` reads the account-owned `read_consultation` snapshot and passes its saved transcript to planning and editorial. Exact user words retain message/board references under `consultationUserReports`; user reports can be cited as `consultation.user`. Native/API stylist messages remain explicitly labelled interpretations, not observations or user evidence. Existing intake reports, target-round feedback, allowed palette, exclusions and separate favourites remain available. The transcript revision and contents participate in the request hash.

The image prompt now states goals and invariants rather than mandating a row of diagnostic figures with no labels:

- Communicate every planned outfit as an appealing, readable whole sheet. One outfit is not a complete profile, and exploration is not approval.
- Preserve identity, ordinary skin/hair character and relevant visible proportions. Do not make clothing work by narrowing the face/waist, lengthening legs or erasing volume. Hidden anatomy and precise fit remain uncertain.
- Preserve supplied colour intent and exclusions without recolouring the face. Retain explicitly loved qualities and qualified feedback while respecting hard constraints.
- Give the renderer freedom over layout, spacing, rhythm and framing. Optional titles use supplied words; no invented approval or verdict.

The existing validated plan still contains two or three directions; that bounded contract was not expanded. The inspected six-look asset is a separate supplied illustration, not output from this revised API prompt. A prompt instruction is not proof that a renderer will obey it.

## What the supplied six-look sheet actually shows

The privately supplied `style-sheet-01.png` was inspected directly. It has **six numbered full figures in one horizontal row**, a title, an eight-swatch strip and a caption identifying prepared exploration rather than an approved profile. It is not six separately composed pages.

Visible clothing differences include teal tailoring, a plum blouse with dark trousers, a long green outer layer, a navy waistcoat over a plum blouse, a red asymmetric wrapped layer over trousers, and a purple jacket over a teal top. This is real visual variation, although wide, floor-length trousers recur across most/all panels and pose/framing are similar.

Material gaps against the stated goals:

- The fourth waistcoat ends around the waist/high hip with pointed fronts and strong inward shaping. Calling it a longer or torso-skimming waistcoat would overstate what is drawn.
- The fifth red look retains a strongly defined wrap waist. The illustration does not establish that abdominal ease or freedom from cinching was achieved.
- Several trouser hems reach the floor with folds/pooling around the shoes. The sheet cannot establish comfortable movement, a practical hem break or real garment fit.
- Repeated face/pose and rendered shaping do not validate identity or anatomical fidelity. Wardrobe-generated outlines must not become new body evidence.

These observations are about pixels and clothing depiction, not new claims about the person’s anatomy, taste or satisfaction. A supplied palette strip also does not prove calibrated colour accuracy or compliance with the saved account palette.

## Verification and limits

TypeScript, targeted ESLint and diff checks passed. Provider transport tests remain available; this change does not alter provider transport, accounting bounds or the disabled release function. Saved consultation revisions are checked after provider results before proceeding, so a detected conversation change rejects the result while retaining conservative accounting. These application checks do **not** provide an atomic database guarantee against a message arriving between the last check and persistence. Atomic consultation-revision/approval binding and verified full-input pricing bounds remain release work; no live success is claimed.

The next useful judgement is owner review of an actual rendered whole sheet against the requested retained qualities, changed features and fidelity. No further generation was performed here.

## Actual pixel paths: follow-up repair

The legacy renderer now resolves a parent/approved round’s actual owned `style_look` media object, downloads it and normalises its bytes. A missing parent image fails before dispatch; the saved plan text cannot substitute for it. Planning receives original B plus parent A, with an explicit ordered role legend. Image editing receives those same two actual references through multipart `image[]`, with declared MIME types and an appended role legend. The single-image interface remains supported. Inputs are limited to two references, each at most 10 MiB.

After rendering, a separate text/vision request receives actual new sheet C plus original B. Its structured critique separates visible observations, rendering errors and goal gaps. That request is not a repetition of the desired prompt presented as a result. Inspection usage is recorded separately as `inspection`; applying the additive usage-action constraint is required before this path can run. A failed or invalid inspection prevents the sheet from being uploaded/finalised. A successful inspection still does not establish owner satisfaction or precise fit. Its notes are saved separately from the plan’s body observations as `renderInspection`.

Legacy editorial receives the actual owned approved whole-sheet image and, when available, the owned original reference. Explicit image roles record a missing original rather than implying it was seen. The new consultation action/job runner is a separate integration owner and supplies its own atomic revision/approval binding; this legacy route’s disabled release function was not changed.

Verification: an isolated harness invoked the actual transpiled `paid()` handler with its actual schemas and provider transport, intercepting all network calls. Three distinct valid raster sentinels represented parent A, original B and new C. Assertions decoded the actual outgoing data URLs and multipart file bytes: planner B+A; renderer B+A with MIME/order legend; inspection C+B before finalisation; editorial approved-sheet bytes plus B. A negative inspection prevented both upload and `finish_style_image`, while retaining conservative rejected-result accounting. This is transport/control-flow evidence, not a real model quality or identity evaluation. The release gate was opened only in the harness’s in-memory source, never in the repository or project configuration. No paid call occurred in this lane.
