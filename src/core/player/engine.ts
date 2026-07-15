import { db } from '../storage/db'
import { getPref, getSetting, setSetting } from '../storage/settings'
import { recordPlay, upsertTrack } from '../library/service'
import { pool, provider } from '../providers'
import type { StreamInfo, Track } from '../models/types'
import { nextIndex, prevIndex, shuffleUpcoming } from './queueMath'
import { currentTrack, playerStore } from './playerStore'
import {
  setupMediaSession,
  updateSessionMetadata,
  updateSessionPlaybackState,
  updateSessionPosition,
} from './mediaSession'

const PERSIST_KEY = 'playerState'
const PRELOAD_TTL_MS = 30 * 60 * 1000
const MAX_STREAM_RETRIES = 2

interface PersistedPlayer {
  queue: Track[]
  index: number
  position: number
  repeat: PlayerSnapshotRepeat
  shuffle: boolean
}

type PlayerSnapshotRepeat = 'off' | 'all' | 'one'

export class PlayerEngine {
  private audio: HTMLAudioElement
  private objectUrl: string | null = null
  private preloaded = new Map<string, { info: StreamInfo; at: number }>()
  private lastStream: StreamInfo | null = null
  private playRecorded = false
  private streamRetries = 0
  private loadToken = 0
  private pendingSeek: number | null = null
  private lastPersist = 0
  /** Set after restore(): the queue is loaded but no audio src yet. */
  private needsLoad = false

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.wireAudioEvents()
    setupMediaSession({
      play: () => void this.toggle(true),
      pause: () => void this.toggle(false),
      next: () => void this.next(),
      prev: () => void this.prev(),
      seek: (s) => this.seek(s),
    })
  }

  // ---- public API -------------------------------------------------------

  async playQueue(tracks: Track[], startIndex = 0): Promise<void> {
    if (tracks.length === 0) return
    playerStore.setState({
      queue: tracks,
      index: Math.min(Math.max(startIndex, 0), tracks.length - 1),
      shuffle: false,
      preShuffleQueue: null,
      error: null,
    })
    await this.loadCurrent(true)
  }

  async playTrack(track: Track): Promise<void> {
    await this.playQueue([track])
  }

  playNext(track: Track): void {
    const { queue, index } = playerStore.getState()
    if (queue.length === 0) {
      void this.playQueue([track])
      return
    }
    const next = [...queue]
    next.splice(index + 1, 0, track)
    playerStore.setState({ queue: next })
    this.persistSoon()
  }

  addToQueue(track: Track): void {
    const { queue } = playerStore.getState()
    if (queue.length === 0) {
      void this.playQueue([track])
      return
    }
    playerStore.setState({ queue: [...queue, track] })
    this.persistSoon()
  }

  removeFromQueue(at: number): void {
    const { queue, index } = playerStore.getState()
    if (at === index) return // removing the playing track is a "next", not a splice
    const next = queue.filter((_, i) => i !== at)
    playerStore.setState({ queue: next, index: at < index ? index - 1 : index })
    this.persistSoon()
  }

  async jumpTo(at: number): Promise<void> {
    const { queue } = playerStore.getState()
    if (at < 0 || at >= queue.length) return
    playerStore.setState({ index: at })
    await this.loadCurrent(true)
  }

  /** force: true = play, false = pause, undefined = flip */
  async toggle(force?: boolean): Promise<void> {
    const state = playerStore.getState()
    const shouldPlay = force ?? !state.isPlaying
    if (!shouldPlay) {
      this.audio.pause()
      return
    }
    if (this.needsLoad && currentTrack(state)) {
      this.needsLoad = false
      this.pendingSeek = state.position
      await this.loadCurrent(true)
      return
    }
    try {
      await this.audio.play()
    } catch {
      /* interrupted or not allowed yet — state events keep UI honest */
    }
  }

  async next(): Promise<void> {
    const state = playerStore.getState()
    const idx = nextIndex({
      length: state.queue.length,
      index: state.index,
      repeat: state.repeat === 'one' ? 'off' : state.repeat,
    })
    if (idx === null) {
      if (await this.extendWithRadio()) return
      this.audio.pause()
      return
    }
    playerStore.setState({ index: idx })
    await this.loadCurrent(true)
  }

  async prev(): Promise<void> {
    if (this.audio.currentTime > 3) {
      this.seek(0)
      return
    }
    const state = playerStore.getState()
    const idx = prevIndex({ length: state.queue.length, index: state.index, repeat: state.repeat })
    if (idx === null) {
      this.seek(0)
      return
    }
    playerStore.setState({ index: idx })
    await this.loadCurrent(true)
  }

  seek(seconds: number): void {
    const duration = playerStore.getState().duration
    const clamped = Math.min(Math.max(seconds, 0), duration || seconds)
    if (this.audio.src && !this.needsLoad) {
      this.audio.currentTime = clamped
    } else {
      this.pendingSeek = clamped
    }
    playerStore.setState({ position: clamped })
  }

  cycleRepeat(): void {
    const order: PlayerSnapshotRepeat[] = ['off', 'all', 'one']
    const current = playerStore.getState().repeat
    const repeat = order[(order.indexOf(current) + 1) % order.length]
    playerStore.setState({ repeat })
    this.persistSoon()
  }

  toggleShuffle(): void {
    const state = playerStore.getState()
    if (!state.shuffle) {
      playerStore.setState({
        shuffle: true,
        preShuffleQueue: state.queue,
        queue: shuffleUpcoming(state.queue, state.index),
      })
    } else {
      const original = state.preShuffleQueue ?? state.queue
      const playing = currentTrack(state)
      const index = playing ? Math.max(original.findIndex((t) => t.id === playing.id), 0) : 0
      playerStore.setState({ shuffle: false, preShuffleQueue: null, queue: original, index })
    }
    this.persistSoon()
  }

  async restore(): Promise<void> {
    const saved = await getSetting<PersistedPlayer | null>(PERSIST_KEY, null)
    if (!saved || saved.queue.length === 0) return
    playerStore.setState({
      queue: saved.queue,
      index: Math.min(saved.index, saved.queue.length - 1),
      position: saved.position,
      repeat: saved.repeat,
      shuffle: saved.shuffle,
    })
    this.needsLoad = true
    const track = currentTrack(playerStore.getState())
    if (track) updateSessionMetadata(track)
  }

  persistNow(): void {
    const s = playerStore.getState()
    void setSetting<PersistedPlayer>(PERSIST_KEY, {
      queue: s.queue,
      index: s.index,
      position: s.position,
      repeat: s.repeat,
      shuffle: s.shuffle,
    })
    this.lastPersist = Date.now()
  }

  // ---- internals --------------------------------------------------------

  private async loadCurrent(autoplay: boolean): Promise<void> {
    const token = ++this.loadToken
    const track = currentTrack(playerStore.getState())
    if (!track) return

    playerStore.setState({
      position: this.pendingSeek ?? 0,
      duration: track.durationSec,
      buffering: true,
      error: null,
    })
    this.playRecorded = false
    this.streamRetries = 0
    this.lastStream = null
    this.releaseObjectUrl()

    let src: string
    try {
      const local = await db.audioBlobs.get(track.id)
      if (token !== this.loadToken) return
      if (local) {
        this.objectUrl = URL.createObjectURL(local.blob)
        src = this.objectUrl
      } else {
        const info = await this.resolveStream(track.id)
        if (token !== this.loadToken) return
        this.lastStream = info
        src = info.url
      }
    } catch (err) {
      if (token !== this.loadToken) return
      playerStore.setState({
        buffering: false,
        isPlaying: false,
        error: err instanceof Error ? err.message : 'Could not load track',
      })
      return
    }

    this.audio.src = src
    if (this.pendingSeek !== null) {
      const seekTo = this.pendingSeek
      this.pendingSeek = null
      this.audio.addEventListener(
        'loadedmetadata',
        () => {
          this.audio.currentTime = seekTo
        },
        { once: true },
      )
    }
    updateSessionMetadata(track)
    void upsertTrack(track)
    this.persistNow()
    if (autoplay) {
      try {
        await this.audio.play()
      } catch {
        /* autoplay blocked until first gesture — UI shows paused state */
      }
    }
  }

  private async resolveStream(trackId: string): Promise<StreamInfo> {
    const cached = this.preloaded.get(trackId)
    if (cached && Date.now() - cached.at < PRELOAD_TTL_MS) return cached.info
    const info = await provider.streamInfo(trackId)
    this.preloaded.set(trackId, { info, at: Date.now() })
    return info
  }

  /** Resolve the next track's stream early so track changes are gapless-ish. */
  private preloadNext(): void {
    const state = playerStore.getState()
    const idx = nextIndex({
      length: state.queue.length,
      index: state.index,
      repeat: state.repeat === 'one' ? 'off' : state.repeat,
    })
    if (idx === null) return
    const track = state.queue[idx]
    if (this.preloaded.has(track.id)) return
    void db.audioBlobs.get(track.id).then((local) => {
      if (!local) {
        void provider
          .streamInfo(track.id)
          .then((info) => this.preloaded.set(track.id, { info, at: Date.now() }))
          .catch(() => {})
      }
    })
  }

  /** Natural queue end + auto-radio on: keep going with related tracks. */
  private async extendWithRadio(): Promise<boolean> {
    const state = playerStore.getState()
    const last = currentTrack(state)
    if (!last || !(await getPref('autoRadio'))) return false
    try {
      const queueIds = new Set(state.queue.map((t) => t.id))
      const related = (await provider.related(last.id))
        .filter((t) => !queueIds.has(t.id))
        .filter((t) => t.durationSec > 45 && t.durationSec < 15 * 60)
        .slice(0, 10)
      if (related.length === 0) return false
      playerStore.setState({
        queue: [...state.queue, ...related],
        index: state.index + 1,
      })
      await this.loadCurrent(true)
      return true
    } catch {
      return false
    }
  }

  /** Mid-play stream failure (expired URL, dying instance): re-resolve and resume. */
  private async recoverFromStreamError(): Promise<void> {
    const track = currentTrack(playerStore.getState())
    if (!track) return
    if (this.objectUrl || this.streamRetries >= MAX_STREAM_RETRIES) {
      playerStore.setState({ buffering: false, isPlaying: false, error: 'Playback failed' })
      return
    }
    this.streamRetries += 1
    const resumeAt = this.audio.currentTime || playerStore.getState().position
    if (this.lastStream) pool.reportFailure(this.lastStream.fromInstance)
    this.preloaded.delete(track.id)
    try {
      const info = await provider.streamInfo(track.id)
      this.lastStream = info
      this.audio.src = info.url
      this.audio.addEventListener(
        'loadedmetadata',
        () => {
          this.audio.currentTime = resumeAt
        },
        { once: true },
      )
      await this.audio.play()
    } catch {
      playerStore.setState({ buffering: false, isPlaying: false, error: 'Playback failed' })
    }
  }

  private wireAudioEvents(): void {
    const audio = this.audio

    audio.addEventListener('timeupdate', () => {
      const position = audio.currentTime
      const duration = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : playerStore.getState().duration
      playerStore.setState({ position, duration })
      updateSessionPosition(position, duration)

      const track = currentTrack(playerStore.getState())
      if (
        track &&
        !this.playRecorded &&
        (position >= 30 || (duration > 0 && position >= duration * 0.5))
      ) {
        this.playRecorded = true
        void recordPlay(track)
      }
      if (duration > 0 && position / duration > 0.6) this.preloadNext()
      if (Date.now() - this.lastPersist > 5000) this.persistNow()
    })

    audio.addEventListener('playing', () => {
      playerStore.setState({ isPlaying: true, buffering: false, error: null })
      updateSessionPlaybackState(true)
    })
    audio.addEventListener('pause', () => {
      playerStore.setState({ isPlaying: false })
      updateSessionPlaybackState(false)
      this.persistNow()
    })
    audio.addEventListener('waiting', () => playerStore.setState({ buffering: true }))
    audio.addEventListener('canplay', () => playerStore.setState({ buffering: false }))

    audio.addEventListener('ended', () => {
      const { repeat } = playerStore.getState()
      if (repeat === 'one') {
        audio.currentTime = 0
        void audio.play()
        return
      }
      void this.next()
    })

    audio.addEventListener('error', () => {
      if (!audio.src) return
      void this.recoverFromStreamError()
    })
  }

  private releaseObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  private persistSoon(): void {
    this.persistNow()
  }
}

export const player = new PlayerEngine()
