import { player } from '../../core/player/engine'
import { currentTrack } from '../../core/player/playerStore'
import { usePlayer } from '../../hooks/usePlayer'
import { useUiStore } from '../../state/uiStore'
import { Artwork } from '../../components/Artwork'
import { Icon } from '../../components/Icon'

export function MiniPlayer() {
  const track = usePlayer(currentTrack)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const buffering = usePlayer((s) => s.buffering)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  const setPlayerOpen = useUiStore((s) => s.setPlayerOpen)

  if (!track) return null
  const pct = duration > 0 ? Math.min((position / duration) * 100, 100) : 0

  return (
    <div className="relative mx-2 mb-1 overflow-hidden rounded-lg bg-neutral-800">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          onClick={() => setPlayerOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Artwork src={track.thumbnailUrl} className="h-10 w-10 shrink-0 rounded" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">{track.title}</p>
            <p className="truncate text-[12px] text-neutral-400">{track.artist}</p>
          </div>
        </button>
        <button
          onClick={() => void player.toggle()}
          className="shrink-0 p-1.5"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {buffering ? (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-white" />
          ) : (
            <Icon name={isPlaying ? 'pause' : 'play'} size={26} />
          )}
        </button>
        <button
          onClick={() => void player.next()}
          className="shrink-0 p-1.5"
          aria-label="Next"
        >
          <Icon name="next" size={22} />
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-neutral-700">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
