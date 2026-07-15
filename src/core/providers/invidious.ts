import type { StreamInfo, Track } from '../models/types'
import { fetchJson, makeTrack, ProviderError, type SourceProvider } from './types'

interface InvidiousVideoItem {
  type?: string
  videoId?: string
  title?: string
  author?: string
  lengthSeconds?: number
}

interface InvidiousAdaptiveFormat {
  url?: string
  type?: string
  bitrate?: string | number
  itag?: string | number
}

interface InvidiousMuxedFormat {
  url?: string
  type?: string
  itag?: string | number
  resolution?: string
  bitrate?: string | number
}

interface InvidiousVideoResponse {
  adaptiveFormats?: InvidiousAdaptiveFormat[]
  formatStreams?: InvidiousMuxedFormat[]
  recommendedVideos?: InvidiousVideoItem[]
}

interface InvidiousSuggestResponse {
  suggestions?: string[]
}

const TIMEOUT = 8000

export class InvidiousProvider implements SourceProvider {
  constructor(private readonly base: string) {}

  async search(query: string, signal?: AbortSignal): Promise<Track[]> {
    const data = await fetchJson<InvidiousVideoItem[]>(
      `${this.base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
      signal,
      TIMEOUT,
    )
    return normalizeItems(Array.isArray(data) ? data : [])
  }

  async suggest(query: string, signal?: AbortSignal): Promise<string[]> {
    const data = await fetchJson<InvidiousSuggestResponse>(
      `${this.base}/api/v1/search/suggestions?q=${encodeURIComponent(query)}`,
      signal,
      TIMEOUT,
    )
    return data.suggestions ?? []
  }

  async streamInfo(videoId: string, signal?: AbortSignal): Promise<StreamInfo> {
    // local=true rewrites stream URLs to proxy through the instance,
    // which is required: raw googlevideo URLs are IP-locked and CORS-blocked.
    const data = await fetchJson<InvidiousVideoResponse>(
      `${this.base}/api/v1/videos/${videoId}?local=true`,
      signal,
      TIMEOUT,
    )
    const audio = pickAudioFormat(data.adaptiveFormats ?? [])
    if (audio?.url) {
      return {
        url: absolutize(audio.url, this.base),
        mime: audio.type?.split(';')[0] ?? 'audio/mp4',
        bitrate: Number(audio.bitrate ?? 0),
        fromInstance: this.base,
      }
    }
    // Fallback: muxed progressive MP4 (itag 18) — see PipedProvider note.
    const muxed = pickMuxedFormat(data.formatStreams ?? [])
    if (!muxed?.url) throw new ProviderError(`no playable audio for ${videoId}`, this.base)
    return {
      url: absolutize(muxed.url, this.base),
      mime: muxed.type?.split(';')[0] ?? 'video/mp4',
      bitrate: Number(muxed.bitrate ?? 0),
      fromInstance: this.base,
    }
  }

  async related(videoId: string, signal?: AbortSignal): Promise<Track[]> {
    const data = await fetchJson<InvidiousVideoResponse>(
      `${this.base}/api/v1/videos/${videoId}`,
      signal,
      TIMEOUT,
    )
    return normalizeItems(data.recommendedVideos ?? [])
  }
}

function normalizeItems(items: InvidiousVideoItem[]): Track[] {
  const tracks: Track[] = []
  for (const item of items) {
    if (item.type && item.type !== 'video') continue
    if (!item.videoId || !item.title) continue
    tracks.push(
      makeTrack(item.videoId, item.title, item.author ?? 'Unknown', item.lengthSeconds ?? 0),
    )
  }
  return tracks
}

export function pickAudioFormat(
  formats: InvidiousAdaptiveFormat[],
): InvidiousAdaptiveFormat | null {
  const audio = formats.filter((f) => f.type?.startsWith('audio/'))
  const byBitrate = (a: InvidiousAdaptiveFormat, b: InvidiousAdaptiveFormat) =>
    Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0)
  const mp4 = audio.filter((f) => f.type?.startsWith('audio/mp4')).sort(byBitrate)
  if (mp4.length > 0) return mp4[0]
  return audio.sort(byBitrate)[0] ?? null
}

export function pickMuxedFormat(formats: InvidiousMuxedFormat[]): InvidiousMuxedFormat | null {
  const mp4 = formats.filter((f) => f.type?.startsWith('video/mp4') && f.url)
  mp4.sort((a, b) => parseInt(a.resolution ?? '9999') - parseInt(b.resolution ?? '9999'))
  return mp4[0] ?? null
}

/** Some Invidious versions return relative proxied URLs. */
function absolutize(url: string, base: string): string {
  return url.startsWith('/') ? `${base}${url}` : url
}
