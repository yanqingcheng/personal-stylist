# Personal stylist

A private, colour-first consultation for the DevDay Community Hackathon, London, 1 November 2026.

[Current public holding page](https://personal-stylist-mauve.vercel.app) · [Stage 1 review request](docs/reviews/stage1-review-request.md)

## Status

This branch implements the non-paid Stage 1 journey: invite-gated sign-in, owned photographs and revisioned profile saves, identical-photo colour comparisons, explicit selection from 31 provisional templates, separate palette preferences, and a public colour-system guide. **The live site is still the earlier holding page.** Supabase provisioning, password sign-in, private storage isolation and the real end-to-end journey have not yet been verified. Paid inference and later styling stages are not enabled.

## Development

Node.js 22 is recommended. Install dependencies with `npm ci`, copy `.env.example` to `.env.local`, and configure a dedicated Supabase project and password sign-in as described in [the backend setup](supabase/README.md). Never commit environment values, invitation phrases or personal photographs. Without configuration, personal-data routes fail closed.

```sh
npm ci
npm run dev
npm run lint
npm run build
node --test lib/colour/index.test.cjs
bash scripts/check-foundation.sh
```

The final command uses a temporary, network-isolated PostgreSQL Docker container to check key SQL boundaries. It does not test Supabase Auth, Storage, or live delivery. Database migration and access setup need actual two-account acceptance before launch.

## Colour and privacy

Photographs are uploaded to private account-owned storage and normalized before display. The same stored reference and crop appear on both sides of a comparison. The study does not send photos to an AI model. For this hackathon, email addresses are not verified and email password recovery is unavailable. Template choice and personal preferences are saved separately from observations; a template is a provisional design aid, not a diagnosis. Export omits photographs and their IDs.

The 31-template atlas and drape definitions are adapted from the project's reviewed colour research at revision `7f5f43d`; its expanded taxonomy, anchor positions and HEX palettes are illustrative and unvalidated. Public references include [The Concept Wardrobe's seasonal guides](https://theconceptwardrobe.com/colour-analysis-comprehensive-guides/complete-seasonal-guides) and [explanation of colour dimensions](https://theconceptwardrobe.com/colour-analysis-comprehensive-guides/what-is-color-analysis). Additional references and their uses are recorded in `data/colour-atlas-31.json`. No private portraits or personal examples are included. “Opal” is a palette name, not the app name.

## Recovery

Read [work packets](docs/work-packets.md), [execution contracts](docs/execution-spec.md), and the review request. The shared issue tracker lives in the primary checkout, `/home/qing/projects/personal-stylist`; do not initialize or import a separate worktree tracker. The intended production alias is `personal-stylist-mauve.vercel.app`; the custom domain remains pending. Total API budget is $50 including tests, but this stage uses no paid model calls.
