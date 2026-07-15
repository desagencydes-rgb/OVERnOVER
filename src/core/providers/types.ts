import type { StreamInfo, Track } from '../models/types'

export type InstanceKind = 'piped' | 'invidious'

export interface Instance {
  url: string
  kind: InstanceKind
}

/**
 * A source of searchable, streamable music. UI code only ever talks to this
 * interface — concrete backends (Piped, Invidious, a future personal worker)
 * are interchangeable.
 */
export interface SourceProvider {
  search(query: string, signal?: AbortSignal): Promise<Track[]>
  suggest(query: string, signal?: AbortSignal): Promise<string[]>
  streamInfo(videoId: string, signal?: AbortSignal): Promise<StreamInfo>
  related(videoId: string, signal?: AbortSignal): Promise<Track[]>
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly instance?: string,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

/** Stable, instance-independent artwork URL for a video id. */
export function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}

/** Build a not-yet-in-library Track from network metadata. */
export function makeTrack(
  id: string,
  title: string,
  artist: string,
  durationSec: number,
): Track {
  return {
    id,
    title: title.trim(),
    artist: cleanArtist(artist),
    durationSec: Math.max(0, Math.floor(durationSec)),
    thumbnailUrl: thumbnailFor(id),
    addedAt: 0,
    lastPlayedAt: null,
    playCount: 0,
    downloadedAt: null,
    sizeBytes: null,
  }
}

/** " Artist - Topic" channels are YouTube's auto-generated music uploads. */
export function cleanArtist(name: string): string {
  return name.replace(/\s*-\s*Topic$/i, '').trim()
}

export function videoIdFromUrl(url: string): string | null {
  const q = url.split('?')[1]
  if (!q) return null
  return new URLSearchParams(q).get('v')
}

export async function fetchJson<T>(
  url: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const res = await fetch(url, { signal: combined })
  if (!res.ok) throw new ProviderError(`HTTP ${res.status} from ${url}`)
  return (await res.json()) as T
}
