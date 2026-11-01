# Personal stylist

A private personal stylist exploring colour, silhouette and vibe, built for the DevDay Community Hackathon, London, 1 November 2026.

[Live personal stylist](https://stylist.qingsworkshop.com) · [Current decisions and worker entry](docs/current-decisions.md) · [Launch evidence](docs/launch-status.md)

## The idea

Personal stylist is a collaborative exploration of colour, silhouette and vibe. The user compares colours against the same portrait, shares their preferences and practical needs, and reviews visual style suggestions with the stylist. The app keeps observations, user preferences and uncertainty distinct: a proposed palette or outfit is something to discuss, not a diagnosis or a promise of fit.

The colour system adapts existing seasonal-colour frameworks into continuous temperature, value and chroma factors and 31 proposed templates. Silhouette and vibe exploration similarly use visual questions and user feedback. These are illustrative design tools, not validated measurements or classifications. [Read the colour guide](https://stylist.qingsworkshop.com/colour-system).

## What's working

Invite-gated accounts can save and resume a consultation, upload private account-owned photos, compare identical-photo colour drapes, choose a provisional palette and record style preferences. The body reference is the user's selected original photograph, not an AI-generated replacement. The studio supports text and GPT-Live conversation, dynamically generated style ideas, feedback and revision, and explicit approval. Features depend on account admission, deployment configuration and available allowance.

Application API tests produced a body-grounded three-look styling image and a neutral two-image edit with synthetic inputs; the latter persisted and reloaded. A later real-input test produced a four-look synthesis from the earlier silhouette image, passed 17 of 17 reload checks, and completed a feedback revision and text editorial. These observations do not establish universal image fidelity or fit. The user reported that voice and conversation worked well; separately, a controlled synthetic-microphone Live call exercised audio, interruption and reload continuity. Delegated backend reasoning in that controlled call remains unverified. An illustrated image editorial is switched off pending testing. The colour study's sign-in, invite boundaries, two-account isolation and late-upload containment were tested; post-expiry cleanup still awaits verification. See [launch evidence](docs/launch-status.md), noting that older entries describe earlier checkpoints.

The runtime uses OpenAI APIs for text and vision, neutral reference edits, style image generation and feedback-driven revision, and full-duplex GPT-Live. Typed consultation uses `gpt-6.1-terra` at medium reasoning; Live's delegated stylist uses Terra at low reasoning. Other text/vision planning and editorial calls retain `gpt-6.1-sol`. Images use `gpt-image-2.5-sunburst`, neutral composites use `gpt-image-2.5-sunburst-2026-09-08`, and voice remains `gpt-live-1`. The scoped Terra change has caller-intercept checks, but no new paid quality trial; see the [migration evidence](docs/evals/consultation-terra-migration.md). Runtime calls are separate from development-time Codex experiments. Outputs are illustrations and require user judgement.

## Development

Node.js 22 is recommended. The public source includes the sanitized atlas, application and SQL migration; private research is not required to build Stage 1.

```sh
npm ci
cp .env.example .env.local
# Fill local values as described below before using personal-data routes.
npm run dev
```

Configure a dedicated Supabase project using [backend setup](supabase/README.md): apply the migration, enable password sign-in with email confirmation disabled, and privately configure attendee/judge invites. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_SITE_URL` in the ignored `.env.local` (and hosting environment for deployment). Public-prefixed values are browser-visible; the secret key must stay server-only. Keep `AI_ENABLED=false` for the non-paid colour study; no OpenAI key is needed for that journey. AI consultation features additionally require `OPENAI_API_KEY`, release and feature flags, and configured transactional spending limits. See the [text route](app/api/consultation/respond/route.ts), [image generation](lib/consultation-generation.ts), [Live configuration](lib/consultation-live.ts) and [budget contract](docs/execution-spec.md) for their gates; historical budget amounts in that contract are superseded by the USD 100 authorisation below. Enable features only after configuring and checking their accounting and access boundaries. Without Supabase configuration, personal-data routes fail closed. Never commit environment values, invite phrases or photographs.

Relevant implementation checks (not needed for documentation-only changes):

```sh
npm run lint
npm run build
node --test lib/colour/index.test.cjs
bash scripts/check-foundation.sh
# Serve the production build with npm start.
```

The final check uses a temporary, network-isolated PostgreSQL Docker container for SQL boundaries; it does not test Supabase Auth or Storage. A new deployment requires real two-account acceptance; see [recorded live acceptance](docs/launch-status.md) for this deployment. Read [AGENTS.md](AGENTS.md) and installed Next.js guides before changing code.

## Colour, privacy and provenance

Photographs are stored privately under their account and normalized before display. Both comparison panels use the same stored reference and crop; flat drapes do not simulate reflected fabric light. Reference generation, image-aware framing and visual stylist calls use account-owned image inputs. Email addresses are unverified and email password recovery is unavailable. Template choice and palette taste are saved separately from observations. A template is a provisional design aid, not a diagnosis. Export omits photographs and their IDs; deletion may remain pending until signed-upload tokens expire.

The atlas and drape definitions were adapted from reviewed project research at revision `7f5f43d`; only sanitized structured colour data was imported. Expanded taxonomy, anchor positions and HEX palettes are illustrative and unvalidated. Public references include [The Concept Wardrobe’s seasonal guides](https://theconceptwardrobe.com/colour-analysis-comprehensive-guides/complete-seasonal-guides) and [colour dimensions](https://theconceptwardrobe.com/colour-analysis-comprehensive-guides/what-is-color-analysis). [Atlas source credits](data/colour-atlas-31.json) record their uses. Private research, portraits and personal examples are not distributed. “Opal” is a palette name, not the app name.

The Next.js scaffold (`create-next-app` 16.4.3), initial holding page and private research predate the 11:00 hackathon build window. The consultation implementation was built during the hackathon. Framework logos/icons are scaffold assets. Private research, portraits and personal examples are not distributed.

## How Codex helped build it

The product idea and factor-based system were developed collaboratively through conversation with GPT and Codex: exploring existing frameworks, questioning their limits, and shaping colour, silhouette and vibe into a user-directed consultation. Before paid application API calls, Codex's built-in image generation supported visual and prompt experiments; those experiments were development work, not proof of the runtime API paths described above.

Codex agents implemented and reviewed parallel pieces of the product, and user feedback repeatedly redirected the journey and prompts. Examples include the [saved colour-study interface](app/profile/page.tsx), [colour evidence logic](lib/colour/index.ts), [consultation generation](lib/consultation-generation.ts) and [account ownership boundaries](supabase/migrations/20261101000000_foundation.sql). Focused review led to save-conflict, A/B placement and interrupted-upload fixes; the [review record](docs/reviews/stage1-review-request.md) describes the changes and evidence.

## Access and budget

Judges and attendees need an invitation supplied privately; funded admission is subject to the available pool and account allowance. The authorised shared API budget is USD 100 including tests, with protected owner funds and separate admission controls. Availability is limited by configured funding, reservations and provider capacity. A conservative accounting reservation or settlement is not necessarily the actual provider charge; use provider usage for actual spend. A paused or exhausted consultation remains saved. Do not put invitation phrases or credentials in the repository.

For implementation context, see [current decisions](docs/current-decisions.md) and [work packets](docs/work-packets.md); older historical decisions may have been superseded by later implementation. Tracker writes belong to the primary checkout’s integration owner.
