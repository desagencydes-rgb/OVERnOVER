import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/storage/db'
import { player } from '../../core/player/engine'
import { downloads } from '../../core/downloads/manager'
import { removeDownload, toggleFavorite } from '../../core/library/service'
import { useUiStore } from '../../state/uiStore'
import { Sheet } from '../../components/Sheet'
import { Artwork } from '../../components/Artwork'
import { Icon, type IconName } from '../../components/Icon'

function Action({
  icon,
  label,
  onPress,
  accent = false,
}: {
  icon: IconName
  label: string
  onPress: () => void
  accent?: boolean
}) {
  return (
    <button
      onClick={onPress}
      className={`flex w-full items-center gap-4 px-5 py-3.5 text-left text-[15px] active:bg-white/5 ${
        accent ? 'text-accent' : ''
      }`}
    >
      <Icon name={icon} size={20} className={accent ? 'text-accent' : 'text-neutral-400'} />
      {label}
    </button>
  )
}

/** The ⋯ action sheet for any track anywhere in the app. */
export function TrackMenu() {
  const track = useUiStore((s) => s.menuTrack)
  const setTrack = useUiStore((s) => s.setMenuTrack)
  const setPlaylistPickerTrack = useUiStore((s) => s.setPlaylistPickerTrack)
  const showToast = useUiStore((s) => s.showToast)

  const favorite = useLiveQuery(
    async () => (track ? (await db.favorites.get(track.id)) !== undefined : false),
    [track?.id],
    false,
  )
  const downloaded = useLiveQuery(
    async () => (track ? (await db.audioBlobs.get(track.id)) !== undefined : false),
    [track?.id],
    false,
  )

  const close = () => setTrack(null)

  return (
    <Sheet open={track !== null} onClose={close}>
      {track && (
        <div className="pb-safe">
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
            <Artwork src={track.thumbnailUrl} className="h-12 w-12 rounded-md" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{track.title}</p>
              <p className="truncate text-[13px] text-neutral-400">{track.artist}</p>
            </div>
          </div>
          <Action
            icon="play"
            label="Play next"
            onPress={() => {
              player.playNext(track)
              showToast('Playing next')
              close()
            }}
          />
          <Action
            icon="queue"
            label="Add to queue"
            onPress={() => {
              player.addToQueue(track)
              showToast('Added to queue')
              close()
            }}
          />
          <Action
            icon="heart"
            label={favorite ? 'Remove from favorites' : 'Add to favorites'}
            accent={favorite}
            onPress={() => {
              void toggleFavorite(track).then((fav) => {
                if (fav) void downloads.maybeAutoDownload(track)
                showToast(fav ? 'Added to favorites' : 'Removed from favorites')
              })
              close()
            }}
          />
          <Action
            icon="plus"
            label="Add to playlist"
            onPress={() => {
              close()
              setPlaylistPickerTrack(track)
            }}
          />
          {downloaded ? (
            <Action
              icon="trash"
              label="Remove download"
              onPress={() => {
                void removeDownload(track.id)
                showToast('Download removed')
                close()
              }}
            />
          ) : (
            <Action
              icon="download"
              label="Save for offline"
              onPress={() => {
                void downloads.enqueue(track)
                showToast('Saving for offline')
                close()
              }}
            />
          )}
        </div>
      )}
    </Sheet>
  )
}
