import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/storage/db'
import { player } from '../../core/player/engine'
import { currentTrack } from '../../core/player/playerStore'
import { toggleFavorite } from '../../core/library/service'
import { downloads } from '../../core/downloads/manager'
import { usePlayer } from '../../hooks/usePlayer'
import { useDownloads } from '../../hooks/useDownloads'
import { useUiStore } from '../../state/uiStore'
import { formatDuration } from '../../lib/format'
import { cn } from '../../lib/cn'
import { Artwork } from '../../components/Artwork'
import { Icon } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Slider } from '../../components/Slider'

export function FullPlayer() {
  const open = useUiStore((s) => s.playerOpen)
  const setOpen = useUiStore((s) => s.setPlayerOpen)
  const setQueueOpen = useUiStore((s) => s.setQueueOpen)
  const showToast = useUiStore((s) => s.showToast)

  const track = usePlayer(currentTrack)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const buffering = usePlayer((s) => s.buffering)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  const repeat = usePlayer((s) => s.repeat)
  const shuffle = usePlayer((s) => s.shuffle)
  const error = usePlayer((s) => s.error)

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
  const downloadingThis = useDownloads((s) => s.activeId === track?.id || s.queuedIds.includes(track?.id ?? ''))

  if (!track) return null

  return (
    <Sheet open={open} onClose={() => setOpen(false)} full>
      <div className="flex h-full flex-col bg-gradient-to-b from-neutral-800 to-surface">
        <div className="pt-safe flex items-center justify-between px-4 pt-3">
          <button onClick={() => setOpen(false)} className="p-2" aria-label="Close player">
            <Icon name="chevron-down" size={24} />
          </button>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-neutral-400">
            Now playing
          </p>
          <button onClick={() => setQueueOpen(true)} className="p-2" aria-label="Queue">
            <Icon name="queue" size={22} />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center px-8">
          <Artwork
            src={track.thumbnailUrl}
            className="aspect-square w-full max-w-sm rounded-xl shadow-2xl"
          />
        </div>

        <div className="px-6 pb-safe">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[20px] font-bold">{track.title}</p>
              <p className="truncate text-[15px] text-neutral-400">{track.artist}</p>
            </div>
            <button
              onClick={() => {
                void toggleFavorite(track).then((fav) => {
                  if (fav) void downloads.maybeAutoDownload(track)
                  showToast(fav ? 'Added to favorites' : 'Removed from favorites')
                })
              }}
              className={cn('p-2', favorite ? 'text-accent' : 'text-neutral-400')}
              aria-label="Favorite"
            >
              <Icon name="heart" size={24} solid={favorite} />
            </button>
            <button
              onClick={() => {
                if (downloaded) {
                  showToast('Already saved')
                } else if (downloadingThis) {
                  showToast('Already downloading')
                } else {
                  void downloads.enqueue(track)
                  showToast('Saving for offline')
                }
              }}
              className={cn('p-2', downloaded ? 'text-accent' : 'text-neutral-400')}
              aria-label="Download"
            >
              <Icon name={downloaded ? 'downloaded' : 'download'} size={24} />
            </button>
          </div>

          {error && <p className="mt-2 text-[13px] text-red-400">{error}</p>}

          <div className="mt-4">
            <Slider
              value={position}
              max={duration}
              onCommit={(v) => player.seek(v)}
              className="w-full"
            />
            <div className="flex justify-between text-[12px] text-neutral-500">
              <span>{formatDuration(position)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="mb-6 mt-2 flex items-center justify-between px-2">
            <button
              onClick={() => player.toggleShuffle()}
              className={cn('p-2', shuffle ? 'text-accent' : 'text-neutral-400')}
              aria-label="Shuffle"
            >
              <Icon name="shuffle" size={20} />
            </button>
            <button onClick={() => void player.prev()} className="p-2" aria-label="Previous">
              <Icon name="prev" size={34} />
            </button>
            <button
              onClick={() => void player.toggle()}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black active:scale-95"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {buffering ? (
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-300 border-t-black" />
              ) : (
                <Icon name={isPlaying ? 'pause' : 'play'} size={34} />
              )}
            </button>
            <button onClick={() => void player.next()} className="p-2" aria-label="Next">
              <Icon name="next" size={34} />
            </button>
            <button
              onClick={() => player.cycleRepeat()}
              className={cn('relative p-2', repeat !== 'off' ? 'text-accent' : 'text-neutral-400')}
              aria-label="Repeat"
            >
              <Icon name="repeat" size={20} />
              {repeat === 'one' && (
                <span className="absolute -right-0.5 top-0.5 text-[9px] font-bold">1</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
