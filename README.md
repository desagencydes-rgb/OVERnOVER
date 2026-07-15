# OVERnOVER

Personal music streaming PWA — private, single-user, zero-cost. Built to be installed on an iPhone Home Screen and feel native.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first** — it explains every design decision, the risks, and the roadmap.

## The one-paragraph version

Search all of YouTube through community-run [Piped](https://github.com/TeamPiped/Piped)/[Invidious](https://github.com/iv-org/invidious) instances, play instantly, and **save tracks into the app's own on-device storage**. Saved music plays offline, forever, regardless of which instances are alive this week. The on-device library is the product; YouTube is only the acquisition layer.

## Install on iPhone

1. Open the deployed URL in Safari: `https://desagencydes-rgb.github.io/OVERnOVER/`
2. Share → **Add to Home Screen** (required — this is what protects your storage from eviction and enables the native feel)
3. Open from the Home Screen icon. Search something, tap ♡ or ⬇ to keep it offline.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # vitest unit tests
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
```

Push to `main` deploys automatically via GitHub Actions → GitHub Pages.

## Keeping sources alive

Public instances die regularly. `public/instances.json` is fetched at runtime — edit it (verified-healthy instances first) and push; every installed client picks it up on next launch, no app update needed. You can also add custom instances in-app under **Settings → Sources**.

## Stack

Vite · React · TypeScript · Tailwind v4 · Zustand · TanStack Query · Dexie (IndexedDB) · Workbox PWA. No server, no accounts, no tracking, no costs.

## Note

Personal-use project. Streaming via Piped/Invidious is against YouTube's ToS — this app is intentionally unpublished, single-user, and polite to volunteer instances (serial downloads, debounced search, hard caching).
