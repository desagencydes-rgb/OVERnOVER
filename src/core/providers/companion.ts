import type { StreamInfo, Track } from '../models/types'
import { fetchJson, makeTrack, ProviderError, thumbnailFor, type SourceProvider } from './types'

interface CompanionTrack {
  id: string
  title: string
  artist?: string
  duration?: number
  thumbnail?: string
}

const TIMEOUT = 12_000

/**
 * Talks to the user's own companion server (Termux + ytmusicapi + yt-dlp on an
 * always-on phone at home). This is the preferred source: a residential IP that
 * YouTube doesn't fight, and yt-dlp — the most actively maintained extractor —
 * doing the work. The server returns data already close to our Track shape and
 * proxies the audio bytes itself, so /stream is directly usable by both the
 * <audio> element and the DownloadManager.
 */
export class CompanionProvider implements SourceProvider {
  constructor(private readonly base: string) {}

  async search(query: string, signal?: AbortSignal): Promise<Track[]> {
    const data = await fetchJson<CompanionTrack[]>(
      `${this.base}/search?q=${encodeURIComponent(query)}`,
      signal,
      TIMEOUT,
    )
    return normalize(data)
  }

  async suggest(query: string, signal?: AbortSignal): Promise<string[]> {
    const data = await fetchJson<string[]>(
      `${this.base}/suggest?q=${encodeURIComponent(query)}`,
      signal,
      TIMEOUT,
    )
    return Array.isArray(data) ? data : []
  }

  async streamInfo(videoId: string, _signal?: AbortSignal): Promise<StreamInfo> {
    // The server streams audio bytes at this URL (Range-enabled). No extra
    // round-trip to resolve a URL — the endpoint *is* the stream.
    void _signal
    return {
      url: `${this.base}/stream/${videoId}`,
      mime: 'audio/mp4',
      bitrate: 0,
      fromInstance: this.base,
    }
  }

  async related(videoId: string, signal?: AbortSignal): Promise<Track[]> {
    try {
      const data = await fetchJson<CompanionTrack[]>(
        `${this.base}/related/${videoId}`,
        signal,
        TIMEOUT,
      )
      return normalize(data)
    } catch {
      return []
    }
  }
}

function normalize(items: CompanionTrack[]): Track[] {
  const tracks: Track[] = []
  for (const item of items) {
    if (!item?.id || !item.title) continue
    const track = makeTrack(item.id, item.title, item.artist ?? 'Unknown', item.duration ?? 0)
    tracks.push({ ...track, thumbnailUrl: item.thumbnail || thumbnailFor(item.id) })
  }
  return tracks
}

export function isCompanionError(err: unknown): err is ProviderError {
  return err instanceof ProviderError
}
