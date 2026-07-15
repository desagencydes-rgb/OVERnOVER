import Dexie, { type Table } from 'dexie'
import type {
  AudioBlobRow,
  DownloadItem,
  FavoriteRow,
  HistoryEntry,
  Playlist,
  SettingRow,
  Track,
} from '../models/types'

class OverDb extends Dexie {
  tracks!: Table<Track, string>
  audioBlobs!: Table<AudioBlobRow, string>
  playlists!: Table<Playlist, string>
  favorites!: Table<FavoriteRow, string>
  history!: Table<HistoryEntry, number>
  downloadQueue!: Table<DownloadItem, string>
  settings!: Table<SettingRow, string>

  constructor() {
    super('overnover')
    this.version(1).stores({
      tracks: 'id, title, artist, downloadedAt, lastPlayedAt, addedAt, playCount',
      audioBlobs: 'trackId',
      playlists: 'id, name, updatedAt',
      favorites: 'trackId, addedAt',
      history: '++id, trackId, playedAt',
      downloadQueue: 'trackId, status, addedAt',
      settings: 'key',
    })
  }
}

export const db = new OverDb()
