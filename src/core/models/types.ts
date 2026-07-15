/** A track's identity is its YouTube video id. */
export interface Track {
  id: string
  title: string
  artist: string
  durationSec: number
  thumbnailUrl: string
  /** 0 = known from search only, not yet part of the library */
  addedAt: number
  lastPlayedAt: number | null
  playCount: number
  downloadedAt: number | null
  sizeBytes: number | null
}

export interface AudioBlobRow {
  trackId: string
  blob: Blob
  mime: string
  size: number
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

export interface FavoriteRow {
  trackId: string
  addedAt: number
}

export interface HistoryEntry {
  id?: number
  trackId: string
  playedAt: number
}

export type DownloadStatus = 'queued' | 'active' | 'error'

export interface DownloadItem {
  trackId: string
  status: DownloadStatus
  addedAt: number
  attempts: number
  error?: string
}

export interface SettingRow {
  key: string
  value: unknown
}

export interface StreamInfo {
  url: string
  mime: string
  bitrate: number
  /** Base URL of the instance that produced this URL (streams are instance-bound). */
  fromInstance: string
}

export type RepeatMode = 'off' | 'all' | 'one'
