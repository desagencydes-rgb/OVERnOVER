import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/storage/db'
import { addToPlaylist, createPlaylist } from '../../core/library/service'
import { useUiStore } from '../../state/uiStore'
import { Sheet } from '../../components/Sheet'
import { Icon } from '../../components/Icon'

export function PlaylistPicker() {
  const track = useUiStore((s) => s.playlistPickerTrack)
  const setTrack = useUiStore((s) => s.setPlaylistPickerTrack)
  const showToast = useUiStore((s) => s.showToast)
  const playlists = useLiveQuery(() => db.playlists.orderBy('updatedAt').reverse().toArray(), [], [])

  const close = () => setTrack(null)

  const pick = async (playlistId: string, name: string) => {
    if (!track) return
    const added = await addToPlaylist(playlistId, track)
    showToast(added ? `Added to ${name}` : `Already in ${name}`)
    close()
  }

  return (
    <Sheet open={track !== null} onClose={close}>
      <div className="pb-safe">
        <h2 className="px-5 py-4 text-[17px] font-bold">Add to playlist</h2>
        <button
          onClick={() => {
            const name = prompt('Playlist name')
            if (name?.trim()) {
              void createPlaylist(name).then((p) => pick(p.id, p.name))
            }
          }}
          className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-[15px] text-accent active:bg-white/5"
        >
          <Icon name="plus" size={20} />
          New playlist
        </button>
        {playlists?.map((p) => (
          <button
            key={p.id}
            onClick={() => void pick(p.id, p.name)}
            className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-[15px] active:bg-white/5"
          >
            <Icon name="music" size={20} className="text-neutral-400" />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="text-[13px] text-neutral-500">{p.trackIds.length}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
