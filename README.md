# The Workshop

One room by HrM that hangs itself around your attention.

The Workshop is a single daylit gallery hall, rendered in real time in the
browser. It measures how long you look at each work. While you are looking
elsewhere, the walls you cannot see are quietly re-hung with works that resemble
what held your gaze — in colour, light, material and series. Works you lingered
on are never taken down. When you turn around, the room has changed to reflect
you.

At any moment, **Your exhibition** fixes the room as it now hangs: a generated
title, a catalogue of how long you looked at each work, the palette of your
attention, a downloadable poster, and a link. Opening the link walks anyone into
exactly that hang. There is no backend: the exhibition lives entirely in the
link.

The previous museum — the fifteen-district campus around the Tower — is kept,
unchanged, at `classic.html`.

## How it works

| Piece | File | Role |
|---|---|---|
| Catalogue | `scripts/catalogue-source.json` → `assets/gallery/catalogue.js` | The works, with a measured visual signature for each (palette, lightness, chroma, hue distribution, texture). |
| Curator | `assets/gallery/curator.js` | Pure logic: attention, similarity, when and what to re-hang, exhibition titles, share links. |
| Room | `assets/gallery/room.js`, `post.js`, `textures.js` | The hall, its light, the reflective floor, frames, plaques, the "develop" reveal, post-processing. |
| Visitor | `assets/gallery/controls.js`, `collision.js` | Walking, looking, approaching a work. |
| Interface | `index.html`, `assets/gallery/ui.js` | Entry, wall labels, the exhibition catalogue and poster. |
| Integration | `assets/gallery/main.js` | Gaze and visibility, the re-hang cycle, links, quality. |

`docs/gallery/BRIEF.md` is the design brief and the contract between modules.

### Adding or changing a work

Edit `scripts/catalogue-source.json`, then run:

```bash
python3 scripts/build-catalogue.py
```

It measures every image and regenerates `assets/gallery/catalogue.js`, and warns
about near-duplicate images. A work's `id` is permanent: shared exhibition links
are made of ids, so never rename or reuse one.

## Develop

```bash
npm install          # once
npm test             # unit suites (fast)
npm run test:all     # unit + browser smoke tests, as CI runs them
npm run serve        # static server on http://localhost:8080
```

`npm run prepare:vendor` refreshes `assets/vendor/three/` and `assets/fonts/`
from the locked dependencies. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to run the
browser tests against a Chromium other than Playwright's own.

## Deploy

Deployment is automatic. Pushing to `main` runs
`.github/workflows/deploy-pages.yml`, which:

1. **Tests** — `npm ci`, installs Chromium, runs `npm run test:all`. A failing
   suite blocks the deploy.
2. **Packages** — regenerates `assets/vendor/` and `assets/fonts/` from the
   locked dependencies and assembles a curated `_site/` containing only
   `index.html`, `classic.html`, `yt.html`, `.nojekyll` and `assets/`.
   Everything else in the repo — `docs/`, `tests/`, `scripts/`,
   `package.json` — is deliberately **not** published.
3. **Deploys** — uploads that artifact to Pages.

This requires **Settings → Pages → Source = "GitHub Actions"**. Pull requests
run the test and package jobs but do not deploy.

There is no CDN dependency. Three.js and the two typefaces (Instrument Serif and
Instrument Sans, SIL Open Font License — see `assets/fonts/`) are vendored from
the versions pinned in `package.json`, and each page's Content-Security-Policy
forbids loading scripts or fonts from anywhere else.

## History

The repository carries the museum's full history, including early revisions
when `index.html` embedded its media as base64. A full clone is around 120 MB;
`git clone --depth 1` avoids that.
