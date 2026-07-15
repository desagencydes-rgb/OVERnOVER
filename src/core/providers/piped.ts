import type { StreamInfo, Track } from '../models/types'
import {
  fetchJson,
  makeTrack,
  ProviderError,
  videoIdFromUrl,
  type SourceProvider,
} from './types'

interface PipedSearchItem {
  url?: string
  type?: string
  title?: string
  uploaderName?: string
  duration?: number
}

interface PipedSearchResponse {
  items?: PipedSearchItem[]
}

interface PipedAudioStream {
  url: string
  mimeType?: string
  bitrate?: number
}

interface PipedVideoStream {
  url: string
  mimeType?: string
  itag?: number
  quality?: string
  videoOnly?: boolean
  bitrate?: number
}

interface PipedStreamsResponse {
  audioStreams?: PipedAudioStream[]
  videoStreams?: PipedVideoStream[]
  relatedStreams?: PipedSearchItem[]
}

const TIMEOUT = 8000

export class PipedProvider implements SourceProvider {
  constructor(private readonly base: string) {}

  async search(query: string, signal?: AbortSignal): Promise<Track[]> {
    const q = encodeURIComponent(query)
    let items = await this.searchWith(q, 'music_songs', signal)
    if (items.length === 0) items = await this.searchWith(q, 'videos', signal)
    return items
  }

  private async searchWith(
    q: string,
    filter: string,
    signal?: AbortSignal,
  ): Promise<Track[]> {
    const data = await fetchJson<PipedSearchResponse>(
      `${this.base}/search?q=${q}&filter=${filter}`,
      signal,
      TIMEOUT,
    )
    return normalizeItems(data.items ?? [])
  }

  async suggest(query: string, signal?: AbortSignal): Promise<string[]> {
    const data = await fetchJson<string[]>(
      `${this.base}/suggestions?query=${encodeURIComponent(query)}`,
      signal,
      TIMEOUT,
    )
    return Array.isArray(data) ? data : []
  }

  async streamInfo(videoId: string, signal?: AbortSignal): Promise<StreamInfo> {
    const data = await fetchJson<PipedStreamsResponse>(
      `${this.base}/streams/${videoId}`,
      signal,
      TIMEOUT,
    )
    const audio = pickAudioStream(data.audioStreams ?? [])
    if (audio) {
      return {
        url: audio.url,
        mime: audio.mimeType ?? 'audio/mp4',
        bitrate: audio.bitrate ?? 0,
        fromInstance: this.base,
      }
    }
    // Instances often can't extract audio-only streams anymore (YouTube
    // countermeasures). Muxed MP4 (itag 18: 360p video + AAC) still works
    // and <audio> plays its audio track — bigger, but it plays.
    const muxed = pickMuxedStream(data.videoStreams ?? [])
    if (!muxed) throw new ProviderError(`no playable audio for ${videoId}`, this.base)
    return {
      url: muxed.url,
      mime: muxed.mimeType ?? 'video/mp4',
      bitrate: muxed.bitrate ?? 0,
      fromInstance: this.base,
    }
  }

  async related(videoId: string, signal?: AbortSignal): Promise<Track[]> {
    const data = await fetchJson<PipedStreamsResponse>(
      `${this.base}/streams/${videoId}`,
      signal,
      TIMEOUT,
    )
    return normalizeItems(data.relatedStreams ?? [])
  }
}

function normalizeItems(items: PipedSearchItem[]): Track[] {
  const tracks: Track[] = []
  for (const item of items) {
    if (item.type && item.type !== 'stream') continue
    const id = item.url ? videoIdFromUrl(item.url) : null
    if (!id || !item.title) continue
    tracks.push(makeTrack(id, item.title, item.uploaderName ?? 'Unknown', item.duration ?? 0))
  }
  return tracks
}

/**
 * iOS <audio> cannot play YouTube's Opus/WebM streams — AAC in MP4 (itag 140)
 * is the one universally playable format. WebM only as a desperate fallback
 * (works on desktop browsers).
 */
export function pickAudioStream(streams: PipedAudioStream[]): PipedAudioStream | null {
  const byBitrate = (a: PipedAudioStream, b: PipedAudioStream) =>
    (b.bitrate ?? 0) - (a.bitrate ?? 0)
  const mp4 = streams.filter((s) => s.mimeType?.includes('audio/mp4')).sort(byBitrate)
  if (mp4.length > 0) return mp4[0]
  const rest = [...streams].sort(byBitrate)
  return rest[0] ?? null
}

/**
 * Muxed fallback: real progressive MP4s only (itag > 0 excludes LBRY and HLS
 * entries some instances inject). Lowest resolution wins — the audio track is
 * identical, the video bytes are dead weight.
 */
export function pickMuxedStream(streams: PipedVideoStream[]): PipedVideoStream | null {
  const candidates = streams.filter(
    (s) => s.videoOnly === false && s.mimeType === 'video/mp4' && (s.itag ?? -1) > 0,
  )
  candidates.sort((a, b) => parseInt(a.quality ?? '9999') - parseInt(b.quality ?? '9999'))
  return candidates[0] ?? null
}
