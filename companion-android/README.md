# OVERnOVER Companion (Android)

A tiny Android app that turns an always-on phone into OVERnOVER's private music
source. It runs an on-device HTTP server backed by
[NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor), so YouTube
extraction happens on a **residential IP** (which YouTube doesn't fight) instead
of a datacenter or a dying public instance.

Verified working on a **Samsung Galaxy J3 (2016), Android 5.1.1** — search,
suggestions, related tracks, and seekable AAC audio streaming at ~3.9 Mbps.

## API

Served on port `8080`. Matches the app's `CompanionProvider`:

| Endpoint | Returns |
|---|---|
| `GET /health` | `{"ok":true}` |
| `GET /search?q=` | `[{id,title,artist,duration,thumbnail}]` (YouTube Music songs) |
| `GET /suggest?q=` | `["…"]` search suggestions |
| `GET /related/<id>` | related tracks |
| `GET /stream/<id>` | audio bytes, `Range`-enabled, proxied from googlevideo |

## Why it's built this way

- **NewPipeExtractor v0.26.3** — the version NewPipe itself ships; earlier ones
  hit YouTube's "The page needs to be reloaded" bot wall.
- **`desugar_jdk_libs_nio`** — Android 5/6 lack `URLEncoder.encode(String, Charset)`
  (added in API 33); the `nio` desugar variant backports it. The plain variant
  does not.
- **OkHttp 3.12.x** — the branch that still supports Android 5/6 TLS.
- **Foreground service + wake/wifi locks + boot receiver** — keeps serving with
  the screen off and restarts itself after a reboot.

## Build

Requires JDK 17+, Android SDK (platform 34, build-tools 34), Gradle 8.7.

```bash
gradle -p companion-android assembleDebug
# APK: companion-android/app/build/outputs/apk/debug/app-debug.apk
adb install -r <that apk>
```

`test-on-device.ps1` installs, starts the service, forwards the port over USB,
and exercises every endpoint.

## Remaining work

- HTTPS tunnel for remote access (the HTTPS PWA can't call a plain-HTTP phone).
- Faster offline downloads (chunked ranged fetch — googlevideo throttles single
  non-ranged pulls; ranged streaming is already full-speed).
