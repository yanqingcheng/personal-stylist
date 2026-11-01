# Personal stylist

Colour-first personal styling consultation for the DevDay Community Hackathon, London, 1 November 2026.

## Current status

Hosting scaffold and an explicitly labelled holding page only. Photo upload, draping, classification and AI analysis are not implemented yet. No database, authentication, analytics or external font requests.

## Stack and setup

Next.js App Router, React, TypeScript and Tailwind CSS. Node.js 22 recommended.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. To verify and run production:

```sh
npm run lint
npm run build
npm start
```

## Hosting

Intended deployment: independent Vercel project, with `stylist.qingsworkshop.com` as the proposed custom domain. A domain is not live until deployment and DNS verification succeed.

## Planned first journey

Portrait and written reflections → identical-photo colour comparisons → provisional colour evidence → separate personal preferences → wearable palette. Persist private account-owned profiles and media once slice0 access controls are implemented. Server-side AI endpoints can be added without a database. Supabase Auth, invite-gated accounts, saved profiles and server-side credit limits are now planned in slice 0; see docs/implementation-plan.md.

## Privacy and secrets

Never commit portraits, private brainstorm notes or API keys. `.env*`, `.vercel/` and `private/` are ignored. This scaffold does not accept photos or call AI services. Document processing behaviour before enabling either.

## Provenance and hackathon timing

- Framework scaffold generated with `create-next-app` 16.4.3 before the 11:00 build window on 1 November 2026.
- Holding-page design and copy created with Codex during pre-build hosting setup.
- Earlier private brainstorm documents inform the intended journey; they are not included here.
- No atlas data, earlier prototype code, personal photos or third-party image assets are included in this scaffold.
- Core product implementation is scheduled for the hackathon build window. Record any reused assets or code here as they are introduced.

Working product title: Personal stylist. Opal is a personal palette name, not the app brand.

## Resume work

Read `docs/implementation-plan.md` and run `br sync --import-only --json` then `br ready --json`. Core implementation is still paused while planning. Commit and push meaningful checkpoints. Private brainstorm material is in the separate private `stylist-notes` repository; it is not included here.

Execution entry point: [work packets](docs/work-packets.md), [contracts](docs/execution-spec.md). Total API budget: $50, including calibration. Actual participant capacity follows measured costs; invite ceiling100. Invite phrases are memorable word strings.
