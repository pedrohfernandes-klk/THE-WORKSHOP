# The Workshop

A walkable 3D museum, served as a static site from GitHub Pages.

## Deploy

Deployment is automatic. Pushing to `main` runs
`.github/workflows/deploy-pages.yml`, which:

1. **Tests** — `npm ci`, installs Chromium, runs `npm run test:all`. A failing
   suite blocks the deploy.
2. **Packages** — regenerates `assets/vendor/` from the locked dependencies and
   assembles a curated `_site/` containing only `index.html`, `yt.html`,
   `.nojekyll` and `assets/`. Everything else in the repo — `docs/`, `tests/`,
   `scripts/`, `package.json` — is deliberately **not** published.
3. **Deploys** — uploads that artifact to Pages.

This requires **Settings → Pages → Source = "GitHub Actions"**. Do not switch it
to "Deploy from a branch": that disables the workflow's deployment target, and
the branch contents are not what the site should serve.

Pull requests run the test and package jobs but do not deploy.

There is no CDN dependency. Three.js is vendored into `assets/vendor/three/`
from the version pinned in `package.json`, and the page's Content-Security-Policy
sets `script-src 'self'`, so a CDN load would be blocked outright. Internet
access is only needed for the external YouTube and web projection sources shown
inside the museum. The site itself needs no server-side code.

## Develop

```bash
npm install          # once
npm test             # unit suite (fast)
npm run test:all     # unit + browser smoke tests, as CI runs them
npm run serve        # static server on http://localhost:8834
```

`npm run prepare:vendor` refreshes `assets/vendor/three/` after a dependency
bump. `python scripts/make-og-card.py` regenerates the sharing card.

## History

The repository carries the museum's full history, including early revisions
when `index.html` embedded its media as base64. A full clone is around 120 MB
for a ~1 MB working tree; `git clone --depth 1` avoids that.

This release adds the Hood warehouse district, a four-mezzanine industrial
hall, 600 m² basement, apartment tower, five-level private penthouse, animated
dual lift system and a 160 × 120 m formal garden.

## Immersive web optimisation

Use `docs/IMMERSIVE_WEB_OPTIMIZATION_BLUEPRINT.md` as the working checklist for
future passes. In short:

- Keep Three.js/WebGL for the spatial museum, but move heavy decorative UI work
  out of the render loop where possible.
- Treat navigation as a story path, not only a room list.
- Use `svh` for panel height constraints on mobile; avoid `dvh` on the 3D
  canvas because browser chrome changes can trigger layout churn.
- Prefer external, compressed assets over returning to a large embedded
  single-file build.
- Validate transitions and hotspots for pragmatic reliability before adding
  spectacle.

For local testing use `npm run serve` (see **Develop** above).
