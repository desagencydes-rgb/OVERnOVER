/**
 * OVERnOVER relay Worker.
 *
 * Bridges the public internet to the companion phone, which sits behind NAT and
 * can't be reached directly. The phone opens ONE outbound WebSocket to this
 * Worker (a Durable Object holds it). Public HTTPS requests to this Worker are
 * forwarded over that socket to the phone, and the phone's responses — including
 * streamed, range-served audio — are piped straight back.
 *
 * Why this instead of cloudflared/ngrok: those are Go binaries that can't
 * resolve DNS on a rootless old Android. An outbound WebSocket uses the phone's
 * own networking, so it just works — while still giving a stable, valid-cert
 * https://<name>.workers.dev URL on Cloudflare's network.
 */

function cors(init) {
  const headers = new Headers(init || {})
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Headers', 'Range, Content-Type')
  headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length')
  return headers
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: cors({ 'content-type': 'application/json' }),
  })
}

export class Relay {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.phone = null
    this.pending = new Map() // id -> { resolveHead, rejectHead, writer, headSent }
    this.nextId = 1
  }

  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/__connect') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 })
      }
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      server.accept()
      // Replace any stale phone connection with the newest one.
      if (this.phone) {
        try {
          this.phone.close(1000, 'replaced')
        } catch (e) {
          /* ignore */
        }
      }
      this.phone = server
      this.failAll('phone reconnected')
      server.addEventListener('message', (ev) => this.onPhoneMessage(ev))
      const drop = () => {
        if (this.phone === server) this.phone = null
        this.failAll('phone disconnected')
      }
      server.addEventListener('close', drop)
      server.addEventListener('error', drop)
      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname === '/__status') {
      return json({ online: this.phone !== null })
    }

    if (!this.phone) {
      return json({ error: 'companion offline' }, 503)
    }

    const id = this.nextId++
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    let resolveHead
    let rejectHead
    const headPromise = new Promise((res, rej) => {
      resolveHead = res
      rejectHead = rej
    })
    const entry = { resolveHead, rejectHead, writer, headSent: false }
    this.pending.set(id, entry)

    const headers = {}
    for (const [k, v] of request.headers) headers[k] = v
    try {
      this.phone.send(
        JSON.stringify({ t: 'req', id, method: request.method, path: url.pathname + url.search, headers }),
      )
    } catch (e) {
      this.pending.delete(id)
      return json({ error: 'send failed' }, 502)
    }

    const timeout = setTimeout(() => {
      const p = this.pending.get(id)
      if (p && !p.headSent) p.rejectHead(new Error('timeout'))
    }, 45000)

    let head
    try {
      head = await headPromise
    } catch (e) {
      clearTimeout(timeout)
      this.pending.delete(id)
      try {
        writer.abort()
      } catch (err) {
        /* ignore */
      }
      return json({ error: 'companion timeout' }, 504)
    }
    clearTimeout(timeout)
    return new Response(readable, { status: head.status, headers: cors(head.headers) })
  }

  onPhoneMessage(ev) {
    try {
      const data = ev.data
      if (typeof data === 'string') {
        const msg = JSON.parse(data)
        const p = this.pending.get(msg.id)
        if (!p) return
        if (msg.t === 'head') {
          p.headSent = true
          p.resolveHead({ status: msg.status, headers: msg.headers || {} })
        } else if (msg.t === 'end') {
          p.writer.close().catch(() => {})
          this.pending.delete(msg.id)
        } else if (msg.t === 'err') {
          if (!p.headSent) p.rejectHead(new Error(msg.msg || 'error'))
          else p.writer.abort().catch(() => {})
          this.pending.delete(msg.id)
        }
      } else if (data instanceof ArrayBuffer) {
        this.onBinary(data)
      } else if (ArrayBuffer.isView(data)) {
        this.onBinary(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
      } else if (data && typeof data.arrayBuffer === 'function') {
        // Blob
        data.arrayBuffer().then((ab) => this.onBinary(ab)).catch((e) => console.error('blob', e))
      } else {
        console.error('unknown binary type:', Object.prototype.toString.call(data))
      }
    } catch (e) {
      console.error('onPhoneMessage error:', e && e.stack ? e.stack : e)
    }
  }

  onBinary(ab) {
    const view = new DataView(ab)
    const id = view.getUint32(0)
    const p = this.pending.get(id)
    if (!p) return
    p.writer.write(new Uint8Array(ab, 4)).catch((e) => console.error('write', e))
  }

  failAll(reason) {
    for (const [, p] of this.pending) {
      if (!p.headSent) {
        try {
          p.rejectHead(new Error(reason))
        } catch (e) {
          /* ignore */
        }
      } else {
        p.writer.abort().catch(() => {})
      }
    }
    this.pending.clear()
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() })
    }
    const id = env.RELAY.idFromName('singleton')
    const stub = env.RELAY.get(id)
    return stub.fetch(request)
  },
}
