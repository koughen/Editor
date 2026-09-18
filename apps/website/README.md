# Editor marketing website

Public site: **https://koughen.github.io/Editor/**

A responsive HTML/CSS/JavaScript site for the Editor desktop application. Includes a keyboard-accessible workspace tour, caption and layout previews, direct platform downloads, a searchable Help Center with 31 guides, FAQs, release notes, Privacy, Terms, and stock-media credits. There are no client framework dependencies or hosted search services.

## Develop and build

From the repository root, with Node.js 22 or later and FFmpeg installed:

```sh
node apps/website/scripts/serve.mjs
```

Open http://127.0.0.1:4173/Editor/. The server builds once on startup. After editing, run `node apps/website/scripts/build.mjs` and refresh. `PORT=4174` selects a different local port.

```sh
node apps/website/scripts/build.mjs
```

The static output is `apps/website/dist/`. No JavaScript package installation, app build, credentials, or external runtime service is needed. FFmpeg makes responsive JPEG derivatives of the workspace product previews at 480, 960, and 1440 pixels. The build also copies the original PNGs for social metadata and the app icon. All runtime URLs are relative, so it works at a domain root or a project subpath.

Run `node apps/website/scripts/check.mjs` after building to validate local routes, anchors, images, and template tokens. CI runs this check before deployment.

For another host, set `SITE_URL=https://example.com/` at build time to update the canonical URL, social metadata, robots file, and sitemap. Review the hosting reference in the credits/privacy dialog if changing providers.

## Deployment

`.github/workflows/website.yml` builds and deploys through GitHub Pages when website source, screenshots, or the app icon changes on `main`. The repository's Pages source must be **GitHub Actions**. A manual workflow dispatch is also available. The deployment does not build or publish a new desktop release.

## Design

The design uses Editor's existing black (`#0b0b0b`), panel gray (`#171717`), warm white (`#f2f2f2`), and yellow (`#ffd600`) palette. Barlow Condensed supplies the large display typography; Manrope handles body text and controls. Square borders, editing rulers, and a playhead carry the app identity into the page.

The hierarchy follows a product tour: download proposition, actual workspaces, interactive feature demonstrations, handoffs, project ownership, platform downloads, and FAQs. Feature and transfer claims reflect the v0.2.0 documentation. No invented customer quotes or usage statistics are included.

## Media and licenses

- App previews: `docs/screenshots/`, based on the stock-media Coastal Drift project. The current previews have updated logo branding; see their [credits](../../docs/screenshots/README.md).
- `public/media/coast-poster.jpg`: frame from **Aerial Shot of an Ocean** by **Engin Akyurt**, [Pexels source](https://www.pexels.com/video/aerial-shot-of-an-ocean-9319200/), [Pexels License](https://www.pexels.com/license/). Used inside the caption-style demonstration. Do not redistribute as standalone stock media.
- Barlow Condensed and Manrope: self-hosted Latin WOFF2 fonts from Google Fonts, licensed under SIL OFL 1.1. License texts live beside the font files in `public/fonts/`.
- Code follows the repository's MIT license. Third-party application names identify supported handoff destinations and do not imply endorsement.

## Manual review

The local server provides `/__preview/mobile` (390px) and `/__preview/tablet` (768px) frames for manual viewport checks. These helpers are not included in the deployed build.

Check all four workspace tabs with clicks and Left/Right/Home/End, caption selectors, all three layout states, mobile navigation and Escape, FAQ expansion, credits dialog dismissal, and each platform download URL. Confirm visible focus, narrow-screen wrapping, and 200% zoom. The stylesheet respects reduced-motion preferences.

When releasing a new desktop version, update installer URLs, visible version text, and release-note links in `index.html`; confirm asset filenames against the published GitHub release before deploying.

## Help and policy content

`content/help.mjs` contains the versioned articles and seven categories. `scripts/pages.mjs` generates static article pages, heading links, tables of contents, related guides, a local full-text search index, release notes, and a branded 404. Add or update articles in that source, then build and check. Search has a title/summary fallback if its full index cannot load; articles remain readable with JavaScript disabled.

`content/policies.mjs` contains Privacy and Terms. These currently identify the operator as the Editor project and describe actual static hosting and local application behavior, without inventing a company, email address, jurisdiction, subscription, or support backend. Update the operator/contact details when provided by the maintainer and review these pages whenever data handling changes. The software's complete existing MIT license is embedded at build time.
