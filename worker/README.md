# OVERnOVER Relay (Cloudflare Worker)

Bridges the public internet to your companion phone, which sits behind NAT. The
phone opens **one outbound WebSocket** to this Worker; public HTTPS requests to
the Worker are forwarded over that socket to the phone and the responses —
including range-served, streamed audio — are piped straight back.

Why a Worker instead of cloudflared/ngrok: those are Go binaries that can't
resolve DNS on a rootless old Android. An outbound WebSocket uses the phone's own
networking, so it just works — while giving a **stable, valid-HTTPS
`https://<name>.workers.dev` URL** on Cloudflare's reliable network. Free, no
domain, no bandwidth cap for personal use.

Validated end-to-end (browser → Worker → Durable Object → WebSocket → phone):
`/health`, `/search`, and seekable `audio/mp4` streaming with HTTP 206 + Range.

## Deploy (one-time, ~5 minutes)

You need a free Cloudflare account (no credit card). From this folder:

```bash
cd worker
npx wrangler login       # opens a browser — authorize your Cloudflare account
npx wrangler deploy      # prints your URL: https://overnover-relay.<you>.workers.dev
```

Then:
1. **On the phone app** (OVERnOVER Companion): paste that URL into the "Relay URL"
   field and tap **Start server**. Wait until it shows **Online**.
2. **In the OVERnOVER web app**: Settings → Companion server → paste the same URL.

That URL is permanent — you only paste it once in each place.

## How it works

- `GET /__connect` — the phone's WebSocket (a Durable Object holds it open).
- `GET /__status` — `{"online":true|false}` (is the phone connected).
- everything else — forwarded to the phone: `/search`, `/suggest`, `/related/<id>`,
  `/stream/<id>`.

Requests are correlated by id; response bodies stream back as binary WS frames,
so large audio never buffers fully in the Worker. The phone replaces any stale
connection on reconnect, so it recovers on its own after drops.

## Debugging

```bash
npx wrangler tail        # live logs from the deployed Worker
```

Local end-to-end test (no deploy): `npx wrangler dev`, point the phone at
`http://localhost:8787` via `adb reverse tcp:8787 tcp:8787`.
