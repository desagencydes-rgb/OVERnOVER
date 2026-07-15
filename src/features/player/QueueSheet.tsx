import { player } from '../../core/player/engine'
import { usePlayer } from '../../hooks/usePlayer'
import { useUiStore } from '../../state/uiStore'
import { Sheet } from '../../components/Sheet'
import { TrackRow } from '../../components/TrackRow'
import { Icon } from '../../components/Icon'

export function QueueSheet() {
  const open = useUiStore((s) => s.queueOpen)
  const setOpen = useUiStore((s) => s.setQueueOpen)
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)

  return (
    <Sheet open={open} onClose={() => setOpen(false)}>
      <div className="pb-safe">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-[17px] font-bold">Queue · {queue.length}</h2>
          <button onClick={() => setOpen(false)} className="p-1 text-neutral-400">
            <Icon name="x" size={20} />
          </button>
        </div>
        {queue.map((t, i) => (
          <TrackRow
            key={`${t.id}-${i}`}
            track={t}
            active={i === index}
            onPress={() => void player.jumpTo(i)}
            trailing={
              i !== index ? (
                <button
                  onClick={() => player.removeFromQueue(i)}
                  className="shrink-0 p-2 text-neutral-500"
                  aria-label="Remove from queue"
                >
                  <Icon name="x" size={16} />
                </button>
              ) : undefined
            }
          />
        ))}
      </div>
    </Sheet>
  )
}
