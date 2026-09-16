# WoW Forever Talent Calculator

Independent fan-made talent planner for World of Warcraft: Forever. Not affiliated with or endorsed by Blizzard Entertainment. Talent data from [talentsforever.com](https://talentsforever.com/) (CC BY 4.0).

Stack: Astro (static) + React + TypeScript + versioned JSON snapshots. See `doc/wowforevertalent-research-prd-development-plan.md` for the full PRD.

## Commands

```bash
npm install          # install dependencies
npm run data:import  # normalize data-raw/talentsforever-data.json → public/data snapshots
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
