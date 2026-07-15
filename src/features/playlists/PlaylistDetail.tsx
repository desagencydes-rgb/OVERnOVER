import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/storage/db'
import { player } from '../../core/player/engine'
import {
  deletePlaylist,
  playlistTracks,
  removeFromPlaylist,
  renamePlaylist,
} from '../../core/library/service'
import { useUiStore } from '../../state/uiStore'
import { TrackRow } from '../../components/TrackRow'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'
import { PlayAllButtons } from '../library/LibraryView'

interface PlaylistDetailProps {
  playlistId: string
  onBack: () => void
}

export function PlaylistDetail({ playlistId, onBack }: PlaylistDetailProps) {
  const showToast = useUiStore((s) => s.showToast)
  const playlist = useLiveQuery(() => db.playlists.get(playlistId), [playlistId])
  const tracks = useLiveQuery(
    async () => {
      const p = await db.playlists.get(playlistId)
      return p ? playlistTracks(p) : []
    },
    [playlistId],
    [],
  )

  if (!playlist) return null

  return (
    <div className="flex flex-col pb-4">
      <div className="pt-safe sticky top-0 z-10 flex items-center gap-2 bg-surface/95 px-2 py-2 backdrop-blur">
        <button onClick={onBack} className="p-2" aria-label="Back">
          <Icon name="chevron-left" size={24} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[19px] font-bold">{playlist.name}</h1>
        <button
          onClick={() => {
            const name = prompt('Rename playlist', playlist.name)
            if (name?.trim()) void renamePlaylist(playlistId, name)
          }}
          className="p-2 text-[13px] text-neutral-400"
        >
          Rename
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete "${playlist.name}"? Tracks stay in your library.`)) {
              void deletePlaylist(playlistId)
              showToast('Playlist deleted')
              onBack()
            }
          }}
          className="p-2 text-neutral-400"
          aria-label="Delete playlist"
        >
          <Icon name="trash" size={18} />
        </button>
      </div>

      {tracks && tracks.length > 0 ? (
        <>
          <div className="flex gap-2 px-4 py-2">
            <PlayAllButtons tracks={tracks} />
          </div>
          {tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              onPress={() => void player.playQueue(tracks, i)}
              trailing={
                <button
                  onClick={() => {
                    void removeFromPlaylist(playlistId, t.id)
                    showToast('Removed from playlist')
                  }}
                  className="shrink-0 p-2 text-neutral-500"
                  aria-label="Remove from playlist"
                >
                  <Icon name="x" size={16} />
                </button>
              }
            />
          ))}
        </>
      ) : (
        <EmptyState
          icon="music"
          title="Empty playlist"
          hint="Use ⋯ on any track → Add to playlist."
        />
      )}
    </div>
  )
}
