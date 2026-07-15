import type { Track } from '../models/types'

interface SessionHandlers {
  play: () => void
  pause: () => void
  next: () => void
  prev: () => void
  seek: (seconds: number) => void
}

function session(): MediaSession | null {
  return 'mediaSession' in navigator ? navigator.mediaSession : null
}

export function setupMediaSession(handlers: SessionHandlers): void {
  const s = session()
  if (!s) return
  s.setActionHandler('play', handlers.play)
  s.setActionHandler('pause', handlers.pause)
  s.setActionHandler('previoustrack', handlers.prev)
  s.setActionHandler('nexttrack', handlers.next)
  try {
    s.setActionHandler('seekto', (d) => {
      if (d.seekTime !== undefined && d.seekTime !== null) handlers.seek(d.seekTime)
    })
  } catch {
    /* seekto unsupported on some platforms */
  }
}

export function updateSessionMetadata(track: Track): void {
  const s = session()
  if (!s) return
  s.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: 'OVERnOVER',
    artwork: [{ src: track.thumbnailUrl, sizes: '320x180', type: 'image/jpeg' }],
  })
}

export function updateSessionPosition(position: number, duration: number): void {
  const s = session()
  if (!s?.setPositionState || !Number.isFinite(duration) || duration <= 0) return
  try {
    s.setPositionState({ duration, position: Math.min(position, duration), playbackRate: 1 })
  } catch {
    /* invalid transient state — ignore */
  }
}

export function updateSessionPlaybackState(playing: boolean): void {
  const s = session()
  if (s) s.playbackState = playing ? 'playing' : 'paused'
}
