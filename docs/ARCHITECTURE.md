# OVERnOVER — Architecture Document (Phase 1)

Personal music streaming PWA for a single user, single primary device (iPhone), responsive to desktop/laptop/TV. Zero-cost, no server owned by us, YouTube as the catalog.

---

## 1. Reality check — assumptions challenged

Before any design, these are the facts your requirements collide with. The architecture below is shaped by them, not by wishful thinking.

### 1.1 "YouTube as the catalog, with no server" is the most fragile possible combination

- A browser **cannot talk to YouTube directly**. YouTube has no public free API for streams, blocks CORS, and stream URLs require signature deciphering and are IP-locked to whoever requested them.
- The only zero-server path is **community-run public instances** of [Piped](https://github.com/TeamPiped/Piped) and [Invidious](https://github.com/iv-org/invidious), which expose CORS-enabled JSON APIs for search/metadata and **proxy the audio stream** through their own servers (solving both CORS and IP-locking).
- Google actively fights these projects. Public instances get IP-blocked, rate-limited, or shut down **regularly**. Any given instance may die on any given week. This is not a maybe — it is the defining operational risk of this project.
- This use violates YouTube's Terms of Service. For private personal use the practical risk is negligible (same category as using yt-dlp), but you should know it, and it is exactly why no reliable commercial-grade option exists for free.

**Verdict:** buildable, but only if the app is designed to *expect* backend failure. The design principle that follows from this is the most important decision in this document:

> **The on-device library is the product. YouTube is only the acquisition layer.**
>
> Streaming from YouTube is best-effort. Every track you care about gets **downloaded into the app's own storage** (your <10 GB library fits comfortably on-device). Once saved, playback is 100% reliable, instant, offline, and immune to instance deaths. The fragile network layer is only touched for *discovering and acquiring new music*.

This inversion turns "flaky YouTube frontend" into "rock-solid offline player with a search-and-grab tool bolted on." It is the only honest way to get Spotify-quality *feel* from this stack.

### 1.2 Audio quality is capped

YouTube serves audio at ~128 kbps AAC (itag 140) or ~130–160 kbps Opus. There is no free lossless. AAC-128 is what we'll use (see §10 for why). It sounds fine on phone speakers/earbuds; it is not audiophile grade. Accepted as a constraint.

**Verified 2026-07-15:** many surviving instances can no longer extract audio-only streams at all (YouTube countermeasures) but still serve the muxed progressive MP4 (itag 18: 360p video + 96 kbps AAC) through their proxy, with Range support. The providers therefore fall back to muxed MP4 when audio-only is unavailable — `<audio>` plays its audio track natively. Cost: a saved track is ~15–25 MB instead of ~4 MB, so plan ~500 muxed tracks per 10 GB instead of ~2,500.

### 1.3 iOS PWA constraints (the ones that actually bite)

| Constraint | Impact | Mitigation |
|---|---|---|
| No Background Fetch API | Downloads only progress while the app is open and foregrounded (or playing audio) | Download queue with resume; downloads run during listening sessions |
| Autoplay policy | First playback needs a user tap | One persistent `<audio>` element unlocked on first tap; queue auto-advance then works |
| Storage eviction | Safari can evict site data after 7 days unused — **but installed (Home Screen) PWAs are exempt** and `navigator.storage.persist()` hardens it | Require Home Screen install; request persistence; show storage health in Settings |
| Storage quota | iOS grants web apps a large share of free disk (multi-GB); not unlimited | `navigator.storage.estimate()` surfaced in UI; LRU cache eviction for non-saved tracks |
| Opus-in-WebM unsupported in `<audio>` | Can't play YouTube's default Opus streams | Always select the AAC/MP4 stream (itag 140) — natively supported |
| No true background app execution | App suspends when backgrounded **unless audio is playing** | Playing audio keeps it alive — same as every music app |
| Lock-screen / control-center controls | Needed for native feel | Media Session API — fully supported in iOS Home Screen PWAs (iOS 15+) |

None of these are fatal. Together they mean: **downloads happen while you use the app**, and the app must be installed to Home Screen (which you wanted anyway).

### 1.4 What I refused to design around

- **Next.js / SSR**: pointless here. There is no SEO, no multi-user, no server. SSR would *add* infrastructure to a project whose constraint is "no infrastructure." Static Vite build wins on startup time too.
- **Free-tier cloud VM (Oracle etc.)**: tempting, but YouTube blocks datacenter IPs aggressively (worse than community instances, which at least rotate), free tiers change terms, and it adds ops burden. Rejected as the *primary* path; kept as a documented escape hatch (§13).
- **Howler.js / audio libraries**: wrappers around the same `<audio>` element, but they get in the way of Media Session and iOS quirks. A thin custom service over one native `<audio>` element is smaller, faster, and fully under our control.

---

## 2. System overview

```
┌────────────────────────── iPhone (PWA, installed) ──────────────────────────┐
│                                                                              │
│  UI (React + Tailwind)                                                       │
│    └── state: Zustand (player/queue/ui) + TanStack Query (server data)       │
│                                                                              │
│  Core services (framework-free TypeScript)                                   │
│    ├── PlayerEngine        — one <audio>, queue, Media Session, preload      │
│    ├── LibraryService      — tracks, playlists, favorites, history (Dexie)   │
│    ├── DownloadManager     — fetch→Blob→IndexedDB, queue, resume, progress   │
│    ├── SourceProvider (interface)                                            │
│    │     ├── PipedProvider      ┐  search / metadata / stream URLs           │
│    │     ├── InvidiousProvider  ┘  (interchangeable, health-checked pool)    │
│    │     └── LocalProvider      — plays downloaded blobs (always wins)       │
│    └── InstancePool        — discovers, health-checks, ranks, rotates        │
│                                                                              │
│  Storage                                                                     │
│    ├── IndexedDB (Dexie): metadata, playlists, history, settings, audio blobs│
│    └── Cache Storage (Workbox): app shell, images/thumbnails                 │
│                                                                              │
└──────────────┬───────────────────────────────────────────────────────────────┘
               │ HTTPS (only when acquiring new music)
        ┌──────▼──────────────────────────────┐
        │ Public Piped / Invidious instances  │  ← untrusted, unreliable,
        │ (search API + audio stream proxy)   │    interchangeable
        └─────────────────────────────────────┘
```

**Data flow, playback:** UI asks PlayerEngine to play a track → LocalProvider checked first (downloaded blob → `URL.createObjectURL`) → else SourceProvider resolves a proxied stream URL from the healthiest instance → `<audio>.src` set → Media Session updated.

**Data flow, acquisition:** search-as-you-type → InstancePool picks instance → results normalized to our `Track` shape → user plays/saves → DownloadManager fetches the AAC stream to a Blob → stored in IndexedDB → track flagged `downloaded`.

---

## 3. Architectures compared

| | A. Client-only + public instances (**chosen**) | B. Personal Cloudflare Worker proxy | C. Home/cloud server (Navidrome-style) |
|---|---|---|---|
| Infra cost | $0, nothing to run | $0 (free tier) | $0 but PC must be on / cloud signup |
| Reliability | Medium — mitigated by download-first design + instance pool | Low-medium — Workers' datacenter IPs get 403'd by googlevideo for streams; search usually OK | High |
| Maintenance | Low code, occasional instance-list refresh | Medium — chasing YouTube breakage yourself | Medium |
| Legal/ToS | Gray (personal use) | Gray | Clean (own files) — but you chose YouTube catalog |
| Fits your answers | ✅ | partial | ❌ (no always-on machine) |

**Chosen: A**, with the provider layer abstracted so **B can be added later as just another `SourceProvider`** (e.g., a Worker running `youtubei.js` for search/metadata only, still streaming via instance proxies) if the public instance ecosystem degrades further. No rewrite either way — that's what the interface buys us.

---

## 4. Technology stack (with justification)

| Choice | Why — and why not the alternative |
|---|---|
| **Vite + React 19 + TypeScript** | Instant dev server, tiny static build, best-in-class ecosystem for the "Apple-level" UI work coming later (Framer Motion etc. are React-first). Not Next.js: no server, no SSR benefit, slower cold start. Not Svelte/Solid: ecosystem depth matters more than benchmark deltas for a solo long-lived project. |
| **Tailwind CSS v4** | Fastest path to a consistent custom design system; zero runtime CSS; you'll be dictating design details and utility classes make iteration cheap. |
| **Zustand** | Player/queue/UI state is small, hot (updates every second during playback), and needs subscription granularity. Redux is ceremony; Context re-renders too much. Zustand selectors keep the seekbar from re-rendering the whole app. |
| **TanStack Query** | Search results, trending, related-tracks = classic async server state: caching, deduping, stale-while-revalidate, retries — exactly the instance-flakiness problems we have. Hand-rolling this is how projects rot. |
| **Dexie (IndexedDB)** | The database: metadata, playlists, history, **and audio Blobs**. Dexie gives typed schemas, compound indexes (fast local search), and `liveQuery` for reactive UI. Chosen over raw OPFS: Safari's Blob-in-IDB support is mature and one storage system is simpler than two; OPFS remains an optimization escape hatch. |
| **vite-plugin-pwa (Workbox)** | Precached app shell (offline startup, instant repeat launches), runtime caching for thumbnails, manifest generation. Industry standard, zero-config-ish. |
| **Native `<audio>` + Media Session API** | See §1.4. One persistent element, wrapped in our own `PlayerEngine` service. |
| **fuse.js** (tiny) | Client-side fuzzy search over the local library — instant, offline, typo-tolerant. |
| **Vitest + Testing Library + fake-indexeddb** | Unit tests for services (queue logic, download manager, providers with mocked HTTP) run in ms. Playwright later for smoke flows. |
| **Hosting: GitHub Pages or Cloudflare Pages** | Free static hosting with HTTPS (service workers require HTTPS). Push-to-deploy. |

Deliberately **not** included: Redux, Howler, RxJS, module federation, monorepo tooling — all complexity without payoff at this scale.

---

## 5. Folder structure

```
overnover/
├── docs/
│   └── ARCHITECTURE.md
├── public/                     # icons, manifest assets, splash screens
├── src/
│   ├── app/                    # app shell: router, providers, layout, error boundary
│   ├── core/                   # framework-free domain logic (no React imports)
│   │   ├── models/             # Track, Playlist, QueueItem, HistoryEntry, Settings
│   │   ├── player/             # PlayerEngine, QueueManager, mediaSession.ts
│   │   ├── providers/          # SourceProvider interface + Piped/Invidious/Local impls
│   │   │   └── instances/      # InstancePool, health checks, instance list
│   │   ├── library/            # LibraryService (CRUD over Dexie)
│   │   ├── downloads/          # DownloadManager, download queue persistence
│   │   └── storage/            # db.ts (Dexie schema), quota utils, blob store
│   ├── features/               # vertical slices: UI + hooks per feature
│   │   ├── search/
│   │   ├── player/             # now-playing bar, full-screen player, queue sheet
│   │   ├── library/            # favorites, downloads, history views
│   │   ├── playlists/
│   │   └── settings/           # instance health, storage usage, cache controls
│   ├── components/             # shared dumb UI primitives (Button, Sheet, Artwork…)
│   ├── hooks/                  # shared hooks (usePlayer, useLibrary, useOnline…)
│   ├── lib/                    # tiny utils: time format, debounce, classnames
│   └── styles/
├── tests/
└── vite.config.ts / tsconfig / etc.
```

Rules: `core/` never imports React (unit-testable in isolation, portable if we ever wrap in Capacitor). `features/` may import `core/` and `components/`, never each other's internals. This is the SOLID boundary that matters; no interface-for-everything ceremony beyond `SourceProvider`, which earns its abstraction (§3).

---

## 6. Data model & storage strategy

Dexie schema (v1):

```ts
tracks:        'id, title, artist, downloadedAt, lastPlayedAt'   // id = yt video id
audioBlobs:    'trackId'                                          // Blob + mime + size
playlists:     'id, name, updatedAt'                              // ordered trackId[]
favorites:     'trackId, addedAt'
history:       '++id, trackId, playedAt'                          // capped at 5k rows
downloadQueue: 'trackId, status, addedAt'                         // survives restarts
settings:      'key'                                              // instance prefs, etc.
```

- **Metadata is stored for every track ever touched** (played, queued, favorited) — a few KB each. This makes history/playlists render instantly with zero network, forever.
- **Audio blobs** only for saved/downloaded tracks (~4 MB per track at AAC-128 → your 10 GB ≈ 2,500 tracks, well within iOS quotas). Blob URLs are minted at play time and revoked after.
- **Quota discipline:** `navigator.storage.persist()` requested at install; `estimate()` shown in Settings; history capped; thumbnail cache LRU-limited by Workbox (`maxEntries`).
- Everything is local. **Backup story:** a Settings → "Export library" button that serializes metadata + playlists (not blobs) to a JSON file you can save to iCloud Files. Cheap insurance against phone loss; re-downloading audio is automatic from the metadata.

---

## 7. Networking strategy

- **`SourceProvider` interface**: `search(q)`, `suggest(q)`, `getStreamUrl(id)`, `getRelated(id)`, `getTrack(id)` — all returning *our* normalized models. UI code never knows Piped exists.
- **InstancePool**: ships with a curated instance list; on app start (and every few hours) it races lightweight health probes and ranks instances by latency + success history (stored in `settings`). Every request: try best instance → on failure/timeout (4 s) transparently retry next → mark failures. Manual instance URL entry in Settings as the ultimate override.
- **TanStack Query policies**: search results cached 10 min; suggestions debounced 200 ms + cached; stream URLs never cached beyond the session (they expire ~6 h and are instance-bound); global `retry` handled by InstancePool, not Query, to avoid double-retry storms.
- **Politeness**: this rides on volunteer-run servers. Debounced search, no prefetch storms, thumbnails cached hard, downloads serialized (one at a time). Being a good citizen is also what keeps instances alive.

## 8. Offline & caching strategy

Three storage tiers, three policies:

1. **App shell** — Workbox precache (HTML/JS/CSS/fonts/icons). The app *always* opens instantly, airplane mode included. Updates via `autoUpdate` + a subtle "reload for update" toast.
2. **Images** (thumbnails/artwork) — Workbox runtime cache, cache-first, LRU `maxEntries: 500`, 30-day expiry.
3. **Audio** — *not* the service worker's job. Managed explicitly by DownloadManager in IndexedDB, because audio needs progress UI, integrity checks, user-visible "downloaded" state, and deliberate eviction — none of which SW caches do well.

**Offline UX rule:** offline is a first-class mode, not an error page. When `navigator.onLine` is false (or the pool is all-dead), search seamlessly switches to the **local library via fuse.js**, and every downloaded track plays normally. The user-visible difference is a small "offline — your library" pill, not a broken app.

## 9. Download strategy

- Explicit "save" action (and auto-save toggles for: favorited tracks, tracks played ≥N times — configurable).
- Queue persisted in Dexie (`downloadQueue`) → survives app kills; resumes when app next opens (iOS gives no background time — §1.3).
- One download at a time, streamed via `fetch` with progress events → assembled Blob → `audioBlobs` put + `tracks.downloadedAt` set, atomically.
- Failures retry with exponential backoff *on a different instance*.
- Eviction: user-initiated per track/playlist, plus a "free up space" tool listing downloads by size/last-played.

## 10. Playback engine

- **One persistent `<audio>` element** created at app boot, unlocked by the first user tap, reused forever (this is what makes iOS auto-advance and lock-screen control work).
- **Format: AAC/MP4 (itag 140)** always — the one format iOS plays natively everywhere (§1.3).
- Queue semantics: current + upNext (user-added) + context (playlist/album/related radio), shuffle/repeat, all in Zustand, persisted to `settings` so a force-quit restores your queue.
- **Preload next**: when current track passes ~60%, resolve the next track's stream URL (or blob) so the gap between songs is ~0. True crossfade/gapless via Web Audio is a later polish item (Web Audio on iOS has its own quirks; not Phase-critical).
- Media Session: metadata + artwork + play/pause/next/prev/seek handlers → native lock-screen and Control Center integration, AirPods controls included.
- Position saved every 5 s → reopening the app resumes mid-track.

## 11. Performance strategy

- **Startup:** static Vite build, precached shell, route-level code splitting (full-screen player and settings lazy-loaded), critical path = shell + Zustand hydrate from Dexie (<50 ms). Target: interactive < 1 s warm.
- **Search:** local fuse.js results render *immediately* while network results stream in below — search always feels instant even when instances are slow.
- **Lists:** virtualized (light `@tanstack/react-virtual`) for history/playlists beyond ~100 rows; thumbnails lazy + `content-visibility`.
- **Memory:** one audio element, blob URLs revoked after use, no full-library-in-memory (Dexie queries + liveQuery).
- **Battery/network:** no polling, no analytics, health checks batched, downloads only on demand.

## 12. Testing strategy

- Vitest unit tests for everything in `core/` (the logic that can actually break): QueueManager transitions, DownloadManager retry/resume (mocked fetch), provider response normalization (fixture JSON from real instances), InstancePool failover, Dexie ops via `fake-indexeddb`.
- Playwright smoke test (later phase): search → play → save → airplane-mode replay.
- UI components get tests only where there's logic; we don't test that Tailwind renders.

## 13. Risks & escape hatches

| Risk | Likelihood | Response |
|---|---|---|
| All public instances dead for days | **High** — a 2026-07-15 probe of 20+ known instances found only 2 fully working (`api.piped.private.coffee` verified end-to-end: search → stream → bytes fetched) | Downloaded library unaffected (the whole point). Instance list is remotely-updatable JSON fetched from the app's own origin, so I can ship fresh instances without an app update. |
| Ecosystem collapses long-term | Possible | Escape hatch B (§3): personal Cloudflare Worker `SourceProvider` for search/metadata; or run yt-dlp on the desktop occasionally to bulk-import files via a simple "import audio files" feature (LocalProvider already handles them). |
| iOS quota/eviction surprises | Low (installed + persist()) | Storage health surfaced in Settings; metadata export/import (§6). |
| Stream 403s mid-play | Medium | PlayerEngine catches `error`, re-resolves URL from next instance, resumes at saved position — user sees a 1–2 s hiccup, not a failure. |

## 14. Development roadmap

Ordered to **kill the biggest risk first** — no UI polish until the fragile part is proven on your actual iPhone.

- **Phase 0 — Scaffold** (small): Vite + TS + Tailwind + PWA plugin + Dexie skeleton, deployed to free HTTPS hosting, installable on your iPhone. *Exit: app icon on your Home Screen.*
- **Phase 1 — The risky spike**: InstancePool + PipedProvider/InvidiousProvider + minimal search box + tap-to-play through `<audio>`. *Exit: you search a song and hear it on the iPhone. If this fails on today's instance ecosystem, we pivot to escape hatch B before writing anything else.*
- **Phase 2 — Playback engine**: full queue, Media Session, preload-next, error-failover, resume. *Exit: lock-screen controls work; a playlist plays hands-off.*
- **Phase 3 — Library**: favorites, playlists, history, local fuzzy search, liveQuery-reactive UI.
- **Phase 4 — Downloads & offline**: DownloadManager, offline mode, storage settings, export/import. *Exit: airplane mode is a fully working music app.*
- **Phase 5 — PWA hardening**: persistence, update flow, quota UI, edge cases (app killed mid-download, expired URLs, dead pool).
- **Phase 6+ — Design system** (user-led, as agreed last): iOS-grade visuals, animations, gestures, responsive layouts for desktop/TV. The `features/` structure means this is reskinning, not rewiring.

---

*Document version 1.0 — to be amended as decisions evolve.*
