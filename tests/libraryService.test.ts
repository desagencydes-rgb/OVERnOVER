import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/core/storage/db'
import {
  addToPlaylist,
  createPlaylist,
  exportLibrary,
  importLibrary,
  recordPlay,
  removeFromPlaylist,
  toggleFavorite,
  upsertTrack,
} from '../src/core/library/service'
import { makeTrack } from '../src/core/providers/types'

const track = () => makeTrack('vid123456ab', 'Test Song', 'Test Artist', 180)

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('upsertTrack', () => {
  it('stamps addedAt on first insert', async () => {
    await upsertTrack(track())
    const saved = await db.tracks.get('vid123456ab')
    expect(saved?.addedAt).toBeGreaterThan(0)
  })

  it('preserves play stats when metadata is refreshed', async () => {
    await upsertTrack(track())
    await db.tracks.update('vid123456ab', { playCount: 7, lastPlayedAt: 123 })
    await upsertTrack({ ...track(), title: 'Renamed' })
    const saved = await db.tracks.get('vid123456ab')
    expect(saved?.title).toBe('Renamed')
    expect(saved?.playCount).toBe(7)
    expect(saved?.lastPlayedAt).toBe(123)
  })
})

describe('favorites', () => {
  it('toggles on and off', async () => {
    expect(await toggleFavorite(track())).toBe(true)
    expect(await db.favorites.count()).toBe(1)
    expect(await toggleFavorite(track())).toBe(false)
    expect(await db.favorites.count()).toBe(0)
  })
})

describe('recordPlay', () => {
  it('bumps play count and writes history', async () => {
    await recordPlay(track())
    await recordPlay(track())
    const saved = await db.tracks.get('vid123456ab')
    expect(saved?.playCount).toBe(2)
    expect(saved?.lastPlayedAt).toBeGreaterThan(0)
    expect(await db.history.count()).toBe(2)
  })
})

describe('playlists', () => {
  it('adds without duplicates and removes', async () => {
    const playlist = await createPlaylist('Roadtrip')
    expect(await addToPlaylist(playlist.id, track())).toBe(true)
    expect(await addToPlaylist(playlist.id, track())).toBe(false)
    expect((await db.playlists.get(playlist.id))?.trackIds).toEqual(['vid123456ab'])
    await removeFromPlaylist(playlist.id, 'vid123456ab')
    expect((await db.playlists.get(playlist.id))?.trackIds).toEqual([])
  })
})

describe('backup', () => {
  it('round-trips export → import into an empty database', async () => {
    await toggleFavorite(track())
    const playlist = await createPlaylist('Mix')
    await addToPlaylist(playlist.id, track())

    const backup = await exportLibrary()
    await Promise.all(db.tables.map((t) => t.clear()))

    await importLibrary(backup)
    expect(await db.tracks.count()).toBe(1)
    expect(await db.favorites.count()).toBe(1)
    expect((await db.playlists.get(playlist.id))?.trackIds).toEqual(['vid123456ab'])
  })

  it('never exports blob-dependent fields', async () => {
    await upsertTrack({ ...track(), downloadedAt: Date.now(), sizeBytes: 4_000_000 })
    const backup = await exportLibrary()
    expect(backup.tracks[0].downloadedAt).toBeNull()
    expect(backup.tracks[0].sizeBytes).toBeNull()
  })
})
