import { db } from '../storage/db'
import { getPref } from '../storage/settings'
import { upsertTrack } from '../library/service'
import { provider } from '../providers'
import type { DownloadItem, Track } from '../models/types'
import { downloadsStore } from './downloadsStore'

const MAX_ATTEMPTS = 4

/**
 * Owns saved audio. Serial queue (one download at a time — kind to instances,
 * predictable on iOS), persisted in Dexie so it survives app kills. iOS gives
 * PWAs no background time: the queue progresses while the app is open, which
 * in practice means while music plays.
 */
export class DownloadManager {
  private running = false
  private activeAbort: AbortController | null = null

  async enqueue(track: Track): Promise<void> {
    await upsertTrack(track)
    const already = await db.audioBlobs.get(track.id)
    if (already) return
    const existing = await db.downloadQueue.get(track.id)
    if (!existing) {
      await db.downloadQueue.put({
        trackId: track.id,
        status: 'queued',
        addedAt: Date.now(),
        attempts: 0,
      })
    } else if (existing.status === 'error') {
      await db.downloadQueue.update(track.id, { status: 'queued', attempts: 0, error: undefined })
    }
    await this.refreshQueueView()
    void this.tick()
  }

  /** Auto-save hook: called when a track is favorited (if the pref is on). */
  async maybeAutoDownload(track: Track): Promise<void> {
    if (await getPref('autoDownloadFavorites')) await this.enqueue(track)
  }

  async cancel(trackId: string): Promise<void> {
    if (downloadsStore.getState().activeId === trackId) this.activeAbort?.abort()
    await db.downloadQueue.delete(trackId)
    await this.refreshQueueView()
  }

  /** Called at boot: anything left 'active' by a killed app goes back to queued. */
  async resume(): Promise<void> {
    await db.downloadQueue.where('status').equals('active').modify({ status: 'queued' })
    await this.refreshQueueView()
    void this.tick()
  }

  async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (navigator.onLine) {
        const next = (await db.downloadQueue.where('status').equals('queued').sortBy('addedAt'))[0]
        if (!next) break
        await this.process(next)
      }
    } finally {
      this.running = false
      downloadsStore.setState({ activeId: null, received: 0, total: 0 })
      await this.refreshQueueView()
    }
  }

  private async process(item: DownloadItem): Promise<void> {
    await db.downloadQueue.update(item.trackId, { status: 'active' })
    this.activeAbort = new AbortController()
    downloadsStore.setState({ activeId: item.trackId, received: 0, total: 0 })
    try {
      const info = await provider.streamInfo(item.trackId, this.activeAbort.signal)
      const res = await fetch(info.url, { signal: this.activeAbort.signal })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const total = Number(res.headers.get('content-length') ?? 0)
      const reader = res.body.getReader()
      const chunks: Uint8Array<ArrayBuffer>[] = []
      let received = 0
      let lastPush = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value as Uint8Array<ArrayBuffer>)
        received += value.byteLength
        if (Date.now() - lastPush > 250) {
          downloadsStore.setState({ received, total })
          lastPush = Date.now()
        }
      }
      if (received < 50_000) throw new Error('Stream too small — likely an instance error page')

      const blob = new Blob(chunks as BlobPart[], { type: info.mime })
      await db.transaction('rw', db.audioBlobs, db.tracks, db.downloadQueue, async () => {
        await db.audioBlobs.put({ trackId: item.trackId, blob, mime: info.mime, size: received })
        await db.tracks.update(item.trackId, { downloadedAt: Date.now(), sizeBytes: received })
        await db.downloadQueue.delete(item.trackId)
      })
      const errors = { ...downloadsStore.getState().errors }
      delete errors[item.trackId]
      downloadsStore.setState({ errors })
    } catch (err) {
      const cancelled = this.activeAbort?.signal.aborted
      const attempts = item.attempts + 1
      if (cancelled) return
      if (attempts >= MAX_ATTEMPTS) {
        const message = err instanceof Error ? err.message : 'Download failed'
        await db.downloadQueue.update(item.trackId, { status: 'error', attempts, error: message })
        downloadsStore.setState({
          errors: { ...downloadsStore.getState().errors, [item.trackId]: message },
        })
      } else {
        await db.downloadQueue.update(item.trackId, { status: 'queued', attempts })
        // Backoff before the loop picks it (or another item) up again.
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempts, 15_000)))
      }
    } finally {
      this.activeAbort = null
    }
  }

  private async refreshQueueView(): Promise<void> {
    const rows = await db.downloadQueue.orderBy('addedAt').toArray()
    downloadsStore.setState({
      queuedIds: rows.filter((r) => r.status !== 'error').map((r) => r.trackId),
    })
  }
}

export const downloads = new DownloadManager()
