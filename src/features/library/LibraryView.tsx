import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/storage/db'
import { player } from '../../core/player/engine'
import { clearHistory, createPlaylist } from '../../core/library/service'
import type { Track } from '../../core/models/types'
import { formatBytes, formatRelativeTime } from '../../lib/format'
import { cn } from '../../lib/cn'
import { useDownloads } from '../../hooks/useDownloads'
import { TrackRow } from '../../components/TrackRow'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import { PlaylistDetail } from '../playlists/PlaylistDetail'

type Segment = 'playlists' | 'favorites' | 'downloads' | 'history'

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'playlists', label: 'Playlists' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'downloads', label: 'Downloads' },
  { key: 'history', label: 'History' },
]

export function LibraryView() {
  const [segment, setSegment] = useState<Segment>('playlists')
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null)

  if (openPlaylistId) {
    return <PlaylistDetail playlistId={openPlaylistId} onBack={() => setOpenPlaylistId(null)} />
  }

  return (
    <div className="flex flex-col pb-4">
      <div className="pt-safe sticky top-0 z-10 bg-surface/95 px-4 backdrop-blur">
        <h1 className="py-3 text-2xl font-bold">Library</h1>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSegment(s.key)}
              className={cn(
                'shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium',
                segment === s.key ? 'bg-white text-black' : 'bg-raised text-neutral-300',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {segment === 'playlists' && <Playlists onOpen={setOpenPlaylistId} />}
      {segment === 'favorites' && <Favorites />}
      {segment === 'downloads' && <Downloads />}
      {segment === 'history' && <History />}
    </div>
  )
}

function Playlists({ onOpen }: { onOpen: (id: string) => void }) {
  const playlists = useLiveQuery(() => db.playlists.orderBy('updatedAt').reverse().toArray(), [], [])
  return (
    <div>
      <button
        onClick={() => {
          const name = prompt('Playlist name')
          if (name?.trim()) void createPlaylist(name)
        }}
        className="flex w-full items-center gap-4 px-4 py-3 text-left text-[15px] text-accent active:bg-white/5"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-raised">
          <Icon name="plus" size={22} />
        </span>
        New playlist
      </button>
      {playlists?.map((p) => (
        <button
          key={p.id}
          onClick={() => onOpen(p.id)}
          className="flex w-full items-center gap-4 px-4 py-3 text-left active:bg-white/5"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-raised text-neutral-400">
            <Icon name="music" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{p.name}</span>
            <span className="text-[13px] text-neutral-500">{p.trackIds.length} tracks</span>
          </span>
          <Icon name="chevron-right" size={18} className="text-neutral-600" />
        </button>
      ))}
      {playlists?.length === 0 && (
        <EmptyState icon="music" title="No playlists yet" hint="Create one to organize your music." />
      )}
    </div>
  )
}

function Favorites() {
  const tracks = useLiveQuery(async () => {
    const favs = await db.favorites.orderBy('addedAt').reverse().toArray()
    const rows = await db.tracks.bulkGet(favs.map((f) => f.trackId))
    return rows.filter((t): t is Track => t !== undefined)
  }, [], [])

  if (!tracks || tracks.length === 0) {
    return <EmptyState icon="heart" title="No favorites yet" hint="Tap the heart on any track." />
  }
  return (
    <div>
      <div className="flex gap-2 px-4 py-2">
        <PlayAllButtons tracks={tracks} />
      </div>
      {tracks.map((t, i) => (
        <TrackRow key={t.id} track={t} onPress={() => void player.playQueue(tracks, i)} />
      ))}
    </div>
  )
}

function Downloads() {
  const activeId = useDownloads((s) => s.activeId)
  const received = useDownloads((s) => s.received)
  const total = useDownloads((s) => s.total)
  const errors = useDownloads((s) => s.errors)

  const downloaded = useLiveQuery(async () => {
    const rows = await db.tracks.where('downloadedAt').above(0).toArray()
    return rows.sort((a, b) => (b.downloadedAt ?? 0) - (a.downloadedAt ?? 0))
  }, [], [])
  const pending = useLiveQuery(async () => {
    const rows = await db.downloadQueue.orderBy('addedAt').toArray()
    const tracks = await db.tracks.bulkGet(rows.map((r) => r.trackId))
    return rows.map((r, i) => ({ item: r, track: tracks[i] })).filter((x) => x.track)
  }, [], [])

  const totalSize = downloaded?.reduce((sum, t) => sum + (t.sizeBytes ?? 0), 0) ?? 0

  return (
    <div>
      {(pending?.length ?? 0) > 0 && (
        <section className="border-b border-white/10 pb-2">
          <h3 className="px-4 pb-1 pt-2 text-[13px] font-semibold uppercase tracking-wide text-neutral-500">
            In progress
          </h3>
          {pending!.map(({ item, track }) => (
            <div key={item.trackId} className="flex items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px]">{track!.title}</p>
                <p className="text-[12px] text-neutral-500">
                  {item.trackId === activeId
                    ? total > 0
                      ? `${formatBytes(received)} / ${formatBytes(total)}`
                      : `${formatBytes(received)}…`
                    : item.status === 'error'
                      ? `Failed: ${errors[item.trackId] ?? item.error ?? 'unknown'}`
                      : 'Waiting…'}
                </p>
              </div>
              {item.trackId === activeId && (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-accent" />
              )}
            </div>
          ))}
        </section>
      )}

      {(downloaded?.length ?? 0) > 0 && (
        <p className="px-4 py-2 text-[13px] text-neutral-500">
          {downloaded!.length} tracks · {formatBytes(totalSize)}
        </p>
      )}
      {downloaded?.map((t, i) => (
        <TrackRow
          key={t.id}
          track={t}
          subtitle={`${t.artist} · ${formatBytes(t.sizeBytes ?? 0)}`}
          onPress={() => void player.playQueue(downloaded, i)}
        />
      ))}
      {downloaded?.length === 0 && (pending?.length ?? 0) === 0 && (
        <EmptyState
          icon="download"
          title="Nothing saved yet"
          hint="Saved tracks play instantly and work offline — even in airplane mode."
        />
      )}
    </div>
  )
}

function History() {
  const entries = useLiveQuery(async () => {
    const rows = await db.history.orderBy('playedAt').reverse().limit(100).toArray()
    const tracks = await db.tracks.bulkGet(rows.map((r) => r.trackId))
    return rows
      .map((r, i) => ({ entry: r, track: tracks[i] }))
      .filter((x): x is { entry: (typeof rows)[0]; track: Track } => x.track !== undefined)
  }, [], [])

  if (!entries || entries.length === 0) {
    return <EmptyState icon="music" title="No listening history" hint="Play something!" />
  }
  return (
    <div>
      <button
        onClick={() => {
          if (confirm('Clear all listening history?')) void clearHistory()
        }}
        className="px-4 py-2 text-[13px] text-neutral-500 active:text-white"
      >
        Clear history
      </button>
      {entries.map(({ entry, track }) => (
        <TrackRow
          key={entry.id}
          track={track}
          subtitle={`${track.artist} · ${formatRelativeTime(entry.playedAt)}`}
          onPress={() => void player.playTrack(track)}
        />
      ))}
    </div>
  )
}

export function PlayAllButtons({ tracks }: { tracks: Track[] }) {
  return (
    <>
      <button
        onClick={() => void player.playQueue(tracks, 0)}
        className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-[14px] font-semibold text-white active:opacity-80"
      >
        <Icon name="play" size={16} /> Play
      </button>
      <button
        onClick={() => {
          void player
            .playQueue(tracks, Math.floor(Math.random() * tracks.length))
            .then(() => player.toggleShuffle())
        }}
        className="flex items-center gap-2 rounded-full bg-raised px-5 py-2 text-[14px] font-semibold active:opacity-80"
      >
        <Icon name="shuffle" size={16} /> Shuffle
      </button>
    </>
  )
}
