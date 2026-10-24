# WoW Forever Talent Calculator

Independent fan-made talent planner for World of Warcraft: Forever. Not affiliated with or endorsed by Blizzard Entertainment. Talent data from [talentsforever.com](https://talentsforever.com/) (CC BY 4.0).

Stack: Astro (static) + React + TypeScript + versioned JSON snapshots. See `doc/wowforevertalent-research-prd-development-plan.md` for the full PRD.

## Commands

```bash
npm install          # install dependencies
npm run data:fetch   # manual: refresh data-raw/ from talentsforever.com/data.json (CC BY 4.0)
npm run data:import  # normalize data-raw/talentsforever-data.json → public/data snapshots
npm run data:diff    # compare the new snapshot with a git ref (default HEAD); --write-changelog adds the /changelog/ entry
npm run dev          # local dev server
npm run build        # data:import + static build → dist/
npm run preview      # serve the production build locally (port 4321)
npm test             # Vitest: rules engine, share codec, data contract, island smoke
npm run test:e2e     # Playwright: key browser flows + SEO acceptance (needs dist/, auto-starts preview)
```

## Architecture

- `src/domain/talents/` — pure rules engine (budget, row gates, prerequisites, transactional actions, compare). No UI, no I/O.
- `src/domain/sharing/` — share payload codec (Base64URL JSON in `#b=` fragment, versioned schema).
- `src/features/builds/` — localStorage drafts and named builds.
- `src/features/compare/` — same-snapshot A/B comparison island.
- `src/components/calculator/` — the calculator island (desktop trees + mobile tabs/detail panel).
- `src/pages/` — Astro routes (home, 9 class calculators, 9 reference pages, changes, sources, about, privacy, compare, my-builds, 404).
- `public/data/` — immutable content-hashed snapshots + manifest. Old snapshots are never overwritten.

## Syncing talent data

Nothing about a game build is hard-coded. To pick up a new upstream export:

1. `npm run data:fetch` (writes `data-raw/talentsforever-data.json` and `data-raw/upstream-meta.json` with the fetch time and sha256).
2. `npm run data:import`. Review renames: `npm run data:diff` lists "possible renames" that are not aliased; add a verified one to `RENAMES` in `scripts/data/import.mjs` (same tree, same cell and icon, continuing effect text). Anything else that disappears is registered as removed and its points are refunded when an old share link opens.
3. `npm run data:diff -- --old-ref origin/main --write-changelog` writes `src/data/changelog/<date>-build-<build>.json`, which `/changelog/` renders.
4. `npm test`, open a PR, merge. Cloudflare builds from Git; `npm run build` re-runs the import and refuses to build if the raw file no longer matches `upstream-meta.json`.

The build number, upstream export date, "checked" date, and rank coverage shown on the site come from `public/data/manifest.json`.

## Deployment (Cloudflare Pages, Git-connected)

Repository: https://github.com/coolbat/wowforevertalentcalculator

One-time setup (Cloudflare dashboard — Git-connected projects can only be
created there; wrangler CLI creates direct-upload projects only):

1. Dash → Workers & Pages → Create → Pages → **Connect to Git** → authorize
   GitHub, select `coolbat/wowforevertalentcalculator`.
2. Build settings:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variable: `NODE_VERSION=22` (`.nvmrc` is also committed)
3. Custom domain (registered at Spaceship):
   - Dash → Add site → `wowforevertalentcalculator.com` (Free plan) → note
     the two assigned Cloudflare nameservers.
   - Spaceship dashboard → Domain → Nameservers → Custom NS → paste both.
   - Back in the Pages project → Custom domains → add
     `wowforevertalentcalculator.com` (and `www` redirecting to apex).
4. Every push to `main` auto-deploys production; PR/branch builds are
   preview deployments (kept out of the sitemap; noindex by exclusion).

Post-deploy verification: `curl -I` the apex URL, `/sitemap.xml`,
`/robots.txt`, `/llms.txt`, and one class page (`/shaman/`).
