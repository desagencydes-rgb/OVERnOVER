import { db } from '../storage/db'
import type { Playlist, Track } from '../models/types'

const HISTORY_CAP = 5000

/** Insert or update a track, never losing library stats already recorded. */
export async function upsertTrack(track: Track): Promise<void> {
  await db.transaction('rw', db.tracks, async () => {
    const existing = await db.tracks.get(track.id)
    if (!existing) {
      await db.tracks.put({ ...track, addedAt: track.addedAt || Date.now() })
      return
    }
    await db.tracks.put({
      ...existing,
      title: track.title,
      artist: track.artist,
      durationSec: track.durationSec || existing.durationSec,
      thumbnailUrl: track.thumbnailUrl,
    })
  })
}

export async function getTrack(id: string): Promise<Track | undefined> {
  return db.tracks.get(id)
}

export async function isFavorite(trackId: string): Promise<boolean> {
  return (await db.favorites.get(trackId)) !== undefined
}

/** Returns the new favorite state. */
export async function toggleFavorite(track: Track): Promise<boolean> {
  return db.transaction('rw', db.favorites, db.tracks, async () => {
    const existing = await db.favorites.get(track.id)
    if (existing) {
      await db.favorites.delete(track.id)
      return false
    }
    await upsertTrack(track)
    await db.favorites.put({ trackId: track.id, addedAt: Date.now() })
    return true
  })
}

export async function recordPlay(track: Track): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.tracks, db.history, async () => {
    await upsertTrack(track)
    await db.tracks.update(track.id, {
      lastPlayedAt: now,
      playCount: ((await db.tracks.get(track.id))?.playCount ?? 0) + 1,
    })
    await db.history.add({ trackId: track.id, playedAt: now })
    const count = await db.history.count()
    if (count > HISTORY_CAP) {
      const oldest = await db.history.orderBy('playedAt').limit(count - HISTORY_CAP).toArray()
      await db.history.bulkDelete(oldest.map((h) => h.id!))
    }
  })
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const now = Date.now()
  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: name.trim() || 'New playlist',
    trackIds: [],
    createdAt: now,
    updatedAt: now,
  }
  await db.playlists.put(playlist)
  return playlist
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  await db.playlists.update(id, { name: name.trim(), updatedAt: Date.now() })
}

export async function deletePlaylist(id: string): Promise<void> {
  await db.playlists.delete(id)
}

/** Returns false if the track was already in the playlist. */
export async function addToPlaylist(playlistId: string, track: Track): Promise<boolean> {
  await upsertTrack(track)
  return db.transaction('rw', db.playlists, async () => {
    const playlist = await db.playlists.get(playlistId)
    if (!playlist || playlist.trackIds.includes(track.id)) return false
    playlist.trackIds.push(track.id)
    playlist.updatedAt = Date.now()
    await db.playlists.put(playlist)
    return true
  })
}

export async function removeFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  await db.transaction('rw', db.playlists, async () => {
    const playlist = await db.playlists.get(playlistId)
    if (!playlist) return
    playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId)
    playlist.updatedAt = Date.now()
    await db.playlists.put(playlist)
  })
}

export async function playlistTracks(playlist: Playlist): Promise<Track[]> {
  const tracks = await db.tracks.bulkGet(playlist.trackIds)
  return tracks.filter((t): t is Track => t !== undefined)
}

export async function removeDownload(trackId: string): Promise<void> {
  await db.transaction('rw', db.audioBlobs, db.tracks, db.downloadQueue, async () => {
    await db.audioBlobs.delete(trackId)
    await db.downloadQueue.delete(trackId)
    await db.tracks.update(trackId, { downloadedAt: null, sizeBytes: null })
  })
}

export async function clearHistory(): Promise<void> {
  await db.history.clear()
}

export interface LibraryExport {
  version: 1
  exportedAt: number
  tracks: Track[]
  playlists: Playlist[]
  favorites: { trackId: string; addedAt: number }[]
}

/** Metadata-only backup (audio re-downloads from ids). Save the file to iCloud. */
export async function exportLibrary(): Promise<LibraryExport> {
  const [tracks, playlists, favorites] = await Promise.all([
    db.tracks.toArray(),
    db.playlists.toArray(),
    db.favorites.toArray(),
  ])
  return {
    version: 1,
    exportedAt: Date.now(),
    tracks: tracks.map((t) => ({ ...t, downloadedAt: null, sizeBytes: null })),
    playlists,
    favorites,
  }
}

export async function importLibrary(data: LibraryExport): Promise<void> {
  if (data.version !== 1) throw new Error('Unsupported backup version')
  await db.transaction('rw', db.tracks, db.playlists, db.favorites, async () => {
    for (const track of data.tracks) {
      const existing = await db.tracks.get(track.id)
      if (!existing) await db.tracks.put(track)
    }
    for (const playlist of data.playlists) {
      const existing = await db.playlists.get(playlist.id)
      if (!existing) await db.playlists.put(playlist)
    }
    for (const fav of data.favorites) {
      const existing = await db.favorites.get(fav.trackId)
      if (!existing) await db.favorites.put(fav)
    }
  })
}
