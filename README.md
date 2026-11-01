# Personal stylist

A private, colour-first consultation for the DevDay Community Hackathon, London, 1 November 2026.

[Live colour consultation](https://personal-stylist-mauve.vercel.app) · [Current decisions and worker entry](docs/current-decisions.md) · [Launch evidence](docs/launch-status.md)

## Status

Stage 1 is live: password/invite access, private account-owned photographs, revisioned profile saves and return, identical-photo colour comparisons, explicit selection from 31 provisional templates, separate palette exclusions, export without photos and a public colour-system guide. Real sign-in, invite boundaries, two-account profile/media isolation and late-upload containment passed acceptance. Post-expiry upload cleanup still awaits verification.

No AI is currently enabled. Generated outfit boards, style feedback, voice, editorial and boutique are future work. A recorded demo is not yet supplied. The [current decisions](docs/current-decisions.md) separate shipped scope, next work, stretch and user decisions from agent proposals. Custom-domain setup is unresolved; use the live alias above.

## Development

Node.js 22 is recommended. The public source includes the sanitized atlas, application and SQL migration; private research is not required to build Stage 1.

```sh
npm ci
cp .env.example .env.local
# Fill local values as described below before using personal-data routes.
npm run dev
```

Configure a dedicated Supabase project using [backend setup](supabase/README.md): apply the migration, enable password sign-in with email confirmation disabled, and privately configure attendee/judge invites. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_SITE_URL` in the ignored `.env.local` (and hosting environment for deployment). Public-prefixed values are browser-visible; the secret key must stay server-only. Keep `AI_ENABLED=false`; no OpenAI key is needed for Stage 1. Without Supabase configuration, personal-data routes fail closed. Never commit environment values, invite phrases or photographs.

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

Photographs are stored privately under their account and normalized before display. Both comparison panels use the same stored reference and crop; they do not simulate reflected fabric light or send photos to an AI model. Email addresses are unverified and email password recovery is unavailable. Template choice and palette taste are saved separately from observations. A template is a provisional design aid, not a diagnosis. Export omits photographs and their IDs; deletion may remain pending until signed-upload tokens expire.

The atlas and drape definitions were adapted from reviewed project research at revision `7f5f43d`; only sanitized structured colour data was imported. Expanded taxonomy, anchor positions and HEX palettes are illustrative and unvalidated. Public references include [The Concept Wardrobe’s seasonal guides](https://theconceptwardrobe.com/colour-analysis-comprehensive-guides/complete-seasonal-guides) and [colour dimensions](https://theconceptwardrobe.com/colour-analysis-comprehensive-guides/what-is-color-analysis). [Atlas source credits](data/colour-atlas-31.json) record their uses. Private research, portraits and personal examples are not distributed. “Opal” is a palette name, not the app name.

The Next.js scaffold (`create-next-app` 16.4.3), initial holding page and private research predate the 11:00 hackathon build window. The consultation implementation was built during the hackathon. Framework logos/icons are scaffold assets; generated styling imagery is not yet included.

## Codex contribution and recovery

Codex work produced the [saved colour-study interface](app/profile/page.tsx), [invite-gated profile/media backend](app/api), [colour evidence logic](lib/colour/index.ts) and [SQL ownership/concurrency boundaries](supabase/migrations/20261101000000_foundation.sql). Focused Sol review led to save-conflict, A/B placement and interrupted-upload fixes; [the review record](docs/reviews/stage1-review-request.md) describes those changes and their evidence. These are development contributions; runtime AI is absent.

Resume from [current decisions](docs/current-decisions.md), then the assigned [work packet](docs/work-packets.md). Tracker writes/export belong to the primary checkout’s integration owner. Total API budget is USD 50 including tests. See [public-readiness audit](docs/public-readiness-audit.md) for this documentation pass and its limits.
