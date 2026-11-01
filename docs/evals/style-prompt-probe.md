# Style prompt probe — 1 November 2026

**Qualitative design probe, not deployed API evaluation or user acceptance.**
Three draft templates: [plan](../../prompts/style/plan.md),
[revise](../../prompts/style/revise.md), [editorial](../../prompts/style/editorial.md).
They propose a small adapter around execution-spec R6/R7; no app/schema/ledger
implementation is included. The intended experience is a joyful expert consultation:
every option on the user, useful disagreement and exploration until **they** are
happy, then an explicitly approved personal editorial. Only the user decides
whether the resulting product is good enough.

## Source evidence and authority

- [Current decisions](../current-decisions.md), especially consultation completion,
  supersede older fixed board counts and mandatory wardrobe requirements.
- [Execution-spec R6/R7](../execution-spec.md#r6--joint-moodboard-consultation) supplies
  LookSpec contents, granular feedback and approval against round/input hash.
- Read-only design notes 02, 09, 15, 16 and 18 were consulted for domain boundaries.
  No private personal-case prose, targets or portraits are reproduced here.
- Official OpenAI [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
  documents schema-constrained output and separate refusal handling. A compatible
  closed schema still needs application checks for ownership, prohibited materials,
  allowed references and current approval; our prompts alone enforce none of these.
- Official [vision guidance](https://developers.openai.com/api/docs/guides/images-vision)
  warns of inaccurate descriptions and spatial-reasoning limitations. These probes
  do not establish measurement accuracy, on-user rendering fidelity or API access.

## Proposed interface and hypotheses to try

These are agent proposals, not measured results or new user requirements.

1. Mount shared evidence rules plus **one** selected domain block in `plan.md`.
   Menswear reasoning concerns construction/fit interactions: shoulders/slope/
   armholes/sleevehead, lapel/gorge, chest ease/button stance, collar, trouser rise/
   seat/break. Womenswear/other-adult reasoning concerns independently sourced
   regional geometry and neckline/waist/hem/volume/softness transitions. This is
   not a universal body-analysis agent with different garment names. Explicitly
   chosen clothing categories determine the workflow; never inferred gender.
2. Use only R6-sized LookSpecs: garments, construction, palette references, proposed
   effects with evidence IDs, rendering notes. Small interpretation/check envelopes
   keep source evidence separate from hypotheses without creating a new ontology.
3. Explicit `preserve`/`change` entries may reduce loss of loved features. Separate
   rendering feedback may reduce false anatomy updates. Both need real trials.
4. Two or three alternatives are a **bounded first probe**, not a final sheet-size
   decision, round cap or completion definition. Revisit option count with the user
   and measured rendering fidelity/cost. Every rendered alternative depicts them.
5. Server checks approval, stale relevant-input hash and allowance before paid
   work. Ordinary account caps and reserved judge/demo allowances stay separate
   within USD 50 total. Exhaustion saves an unfinished consultation. Prompts never
   approve a style, grant credits, or treat one good revision as the whole journey.

## Six synthetic cases: inputs, expected behaviour, qualitative outputs

Method: the implementing native Codex model walked through these fictional inputs
in this session with the rubric visible, generating the excerpts below. This is
an author-visible qualitative exercise, not a blinded sample, automated test run,
API call, empirical success rate or real visual-fidelity assessment. Original
fictional words are preserved below. The small LookSpecs are proposals, not real
stock or verified material specifications. No private target classification was
supplied. A separate native child critiques selected outputs and public images.

Common text-only fixture context: explicitly chosen clothing domain; two requested
options; simulated face/full-body availability labelled **synthetic, no image
inspected**; user-selected test palette with local references `ink`, `cream`,
`cobalt`, `rose`. No inventory. IDs below are local fixture IDs, not atlas class,
real media or product IDs. Production must substitute validated IDs and owned
references. All body statements below are fictional self-report, not observations.

### S1 — loved texture, rejected neckline, then reject-all

Input W, previous top `t1`: rose pebbled cloth, high neck band, straight hem.
`f1`: **“I love the pebbled texture; hate the neck band. I want more air around my
neck.”** Goal: playful gallery opening. No material prohibition.

Expected: retain texture/colour; revise neckline coherently; no anatomy inference.
Generated excerpt: `whatIHeard: f1 → keep pebbled texture, remove enclosing band`.
Look A: `t2`, rose pebbled-cloth top, open square neckline and straight hem; ink
straight trousers. Look B: `t3`, same texture, open split neckline, softly eased
hem; ink trousers. `changes: t1 → preserve texture/rose, change neckline only`.
Hypothesis: opening creates a less enclosed neckline **for the user's stated
experience**, not proof of a short neck. Harmony remains a composition hypothesis;
taste is supported by f1; practical fit unknown; complementarity unevaluated.

Follow-up `f1b`: **“Neither. Keep that texture, but both feel too formal.”**
Generated continuation: “What would make this feel more like you: an easy daytime
shape, or bolder playful detail?” Offer pebbled overshirt/open-neck casual top
directions on the same references, preserving texture; do not auto-settle, abandon
the like, blame the user or offer a stranger inspiration panel. Reject-all is a
valid new direction, not evidence all necklines failed.

### S2 — rendering error is not new anatomy

Input M, approved-for-testing specification `j1`: cream cotton-drill jacket,
natural shoulder, moderate chest ease, open collar, straight trousers.
`f2`: **“You drew my shoulders wider and pinched the waist. Same jacket please.”**

Expected: preserve garment specification and body evidence; mark comparison
inconclusive, fix rendering. Generated excerpt: `dimensions: [rendering]`;
`changes: j1 → preserve entire construction/palette, change: []`;
`renderingNotes: preserve reference shoulder width and waist; no body reshaping`.
No update to shoulder geometry, chest ease, preference, colour or type. Correcting
the picture is a retry of the intended comparison, not another vote for a body
hypothesis. Actual observable fidelity remains untested here.

### S3 — practical material ban outranks an attractive texture

Input M, `u3`: **“No animal fibres anywhere, including blends and lining. I want
a luminous evening jacket, not a business suit.”** Previous candidate included
silk-wool cloth. No retailer records supplied.

Expected: reject silk/wool, including hidden components; keep evening character;
do not infer low chroma or label a real product safe. Generated alternatives:
ink cotton-sateen jacket with restrained sheen/open collar and cobalt pocket
detail; cream lyocell-and-cotton concept with cotton lining and ink trousers.
Both have explicit
**specification requirement: no animal fibre in shell, blend, lining or trim**;
an initial unspecified “lyocell blend” idea was rejected as insufficiently bounded.
These are proposed material specifications, not certified real garments. Proposed
sheen is a material-design hypothesis. No tie/suit mandate. No image spend on
the incompatible prior jacket. Procurement remains unverified, separately from
the proposed look's taste/harmony.

### S4 — joyful menswear first board, not a corrective punishment

Input M, `u4`: **“I want cheerful space-age clothes for a design fair. No office
suits. I like clean shapes and one surprising colour.”**

Expected: both first options fulfil the request, with menswear-specific testable
construction. Generated A: cream short stand-collar overshirt, clean natural
shoulder, easy chest, cobalt asymmetric pocket; ink mid-rise straight trousers
with no break. B: ink zip jacket, slightly extended shoulder, generous armhole,
cream wide straight trousers and cobalt zipper tape. Hypothesis: compare contained
versus slightly broader upper construction while keeping the clean playful
character. No inference about actual shoulder slope or sizing. Neither option is
a dull corporate suit placed there to prove the stylist right; no need to challenge
this feasible aspiration. Every proposed render uses the same simulated subject.

### S5 — regional differences retained in other-adult reasoning

Input W, `u5a`: **“My shoulders slope; my jaw is angular; my calves are muscular.”**
`u5b`: **“I want joyful geometric florals, a jacket and trousers, no skirts.”**
No torso/waist/hip evidence, measurements or source photo observations supplied.

Expected: preserve three distinct reports and unknown regions; do not average
into yin/yang, infer personality or import a full menswear suit checklist.
Generated A: cream jacket with lightly supported shoulder and open neckline,
cobalt geometric floral top, ink straight trousers. B: ink jacket with natural
shoulder, rose geometric floral open-neck top, slightly wider trousers. Hypothesis:
test shoulder support and trouser width as separate visible interactions; angular
print echoes the requested visual language, not an alleged personality. Actual
calf clearance requires fit evidence. Waist shaping stays relaxed/provisional
because no waist evidence exists. Ask whether structured shoulders feel comfortable,
not which global type the user is. Skirts never reappear.

### S6 — optional wardrobe, seventh round, exhaustion and editorial gate

Input approved-look candidate `r7/hash7`, no inventory or sourcing, `f6`:
**“I like the jacket, still not happy with the trousers.”**

Expected/generated: preserve jacket and keep revising trousers into round 8 if
the applicable allowance suffices. A seventh round is not a stop signal. If
allowance is exhausted, save f6 and all rounds as **unfinished, paused**; no
editorial, forced approval or loss of progress. Same rule applies to attendee or
judge/demo, using their own applicable allowance rather than conflating pools.

Gate variants: “Nice!” without explicit approval action →
`{"status":"needs_current_approval","editorial":null}`. Explicit approval of
`r7/hash6` while current is `hash7` → same gate response. Only later explicit
approval of the selected current round/hash yields `ready`: style-only editorial
using its garment grammar, `finalImage: null`, no fabricated products, and
**“Wardrobe complementarity was not assessed.”** Missing inventory never blocks
this approved editorial. A later material edit requires approval again.

## Two public adult visual probes from the existing corpus

Selection started with the existing private source audit, not a new celebrity
search. The corpus is primarily colour claims; it supplies **no verified body-line
or essence target** for these cases. Two relevant images were actually viewed by
this session and one fresh-context native child. The child's brief contained local
neutral filenames, no celebrity names, article URLs, expected body types or source
verdicts. Recognition from public faces remains possible. No accuracy score is
meaningful, and the colour disagreements below are not resolved by this exercise.

### P1 — Margot Robbie, outfit construction rather than a body-type verdict

**Sources/claims, kept apart from observations.**
[Four Seasons Studio, 24 July 2024](https://fourseasons.studio/blogs/news/margot-robbie-color-season-revealed)
calls her Light Summer; [Francesca Cairns, 11 September 2025](https://imageconsultantmaidenhead.co.uk/blogs/colour-analysis-introduction/margot-robbie-a-radiant-light-spring)
calls her Light Spring. These remain attributed colour opinions, not body evidence.
The [Four Seasons outfit collage](https://cdn.shopify.com/s/files/1/0729/6214/6631/files/Neutral_Pastel_Aesthetic_Vintage_Moodboard_Photo_Collage_Grid_Instagram_Post_28_480x480.webp?v=1721664854)
contains an embedded season caption: full label blinding **failed**. No season
inference was attempted. Article/collage credit: Four Seasons Studio; underlying
photographer credits and image provenance were not established.

**Actual visible observations:** open textured jacket with vertical front edges
over a short top and straight trousers; cropped textured skirt ensemble; shaped
blazer-style mini with diagonal lapels; strapless satin mini with visible bodice
seams. These establish garment differences, not anatomy or exact fabric content.

**Hypothesis/next test:** polished decorative character through repeated texture,
versus a sleeker construction; tentative aesthetic prose only. Compare waist ease
with neckline, fabric, hem and pose held constant. Different poses, crops, outfits
and lighting prevent isolating a causal body-line effect in this collage.

**Viewing versus editing:** useful for viewing neckline/waist/hem interactions;
unsuitable as an established reference-editing or redistribution fixture. No such
licence was found. [Site terms](https://fourseasons.studio/pages/terms-of-service)
restrict reproduction without permission. Keep article links/credits, not copies.

### P2 — Henry Cavill, menswear collar evidence with a hard crop boundary

**Sources/claims, kept apart from observations.**
[ToneMatch's existing article](https://www.tonematch.pro/color-season/bright-spring-celebrities/)
lists Bright Spring and credits celebrity photos to TMDB;
[Season Approved](https://seasonapproved.com/celebrity/henry-cavill/undertone)
claims Cool Winter. Both are published colour opinions. Neither establishes body
construction or essence. The child's brief withheld both. The
[actual linked portrait](https://image.tmdb.org/t/p/w185/dgTD7Q9owL3DyX9uYoSX9KZeUUz.jpg)
is only 185 pixels wide. Credit: TMDB via ToneMatch; original photographer unknown.

**Actual visible observations:** open white spread collar, outward collar points,
a V opening below the neck, partial shoulder contours. No full-body view, sleevehead,
chest ease, waist, coat length or trouser evidence is present.

**Hypothesis/next test:** relaxed clean presentation from this collar opening,
not personality or a global type. Compare narrower versus wider collar openings
on matched references. Grooming, portrait lighting, pose and missing lower-body
evidence prevent a full menswear-construction assessment. The useful outcome is
the explicit evidence boundary, not a generic Kibbe label filling missing data.

**Viewing versus editing:** usable as a limited neckline observation, not a
full-body or established reference-editing fixture. TMDB attribution is not an
editing/redistribution licence; its terms page was inaccessible during this check.
No open licence or photographer permission was established. No public photo
copies or generated celebrity edits were committed, and no paid API calls made.

These cases do **not** block native viewing experiments pending owner-photo
consent. They also do not certify the owner's identity/figure preservation. To
exercise actual body-line changes, the missing input is a sufficiently clear
full-body reference with usable editing permission; a headshot cannot supply it.

## Independent critique and resulting corrections

One fresh-context native child inspected the templates, the two images and the S1,
S2 and seventh-round output decisions. It found those decisions coherent but noted
that square-neck depth was still a proposal, not something dictated by the quote.
Its critique changed these drafts: revision explicitly overrides planning's exact
look count; visible type-caption leakage must be disclosed/excluded as evidence;
backend operation eligibility is supplied rather than guessed; rendering-only
corrections require immutable garment-field comparison; hypothesis notes state
what sources actually support; required editorial disclosures outrank decorative
prose. No second review loop or empirical pass claim is implied.

## What this increment demonstrates, and what it does not

The excerpts articulate the intended preservation, correction, domain separation
and continuation decisions. Draft review exposed two omissions: reject-all needed
its own instruction, and “no round cap” needed explicit continuation/exhaustion
behaviour. Both are now in the templates. These are design findings, not observed
failures of deployed models. JSON adherence and runtime cap enforcement were not
tested; there is no API latency/cost, user fidelity or user satisfaction evidence.
No app/deployment changes or paid calls were made in this lane.

For a real on-user rendering probe, obtain one consenting adult's clear frontal
face/neck/hair photo and a clear full-body reference showing shoulder-to-foot
proportions in ordinary clothes, with explicit cloud-processing consent. Publication
is separate consent. Ask for their chosen clothing domain and preferred first
direction. Expected observable comparison: recognisable face and approximate
figure in **every** option; same loved texture visibly retained while neckline
changes; no shoulder/waist reshaping; user can reject all, request another round,
and pause unfinished. The subject judges whether fidelity and the style are good
enough. This consented-reference need does not block viewing public adult cases.
