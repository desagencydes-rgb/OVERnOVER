import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../core/storage/db'
import type { Track } from '../core/models/types'
import { formatDuration } from '../lib/format'
import { cn } from '../lib/cn'
import { useUiStore } from '../state/uiStore'
import { Artwork } from './Artwork'
import { Icon } from './Icon'

interface TrackRowProps {
  track: Track
  onPress: () => void
  subtitle?: string
  active?: boolean
  trailing?: ReactNode
}

export function TrackRow({ track, onPress, subtitle, active = false, trailing }: TrackRowProps) {
  const setMenuTrack = useUiStore((s) => s.setMenuTrack)
  const downloaded = useLiveQuery(
    async () => (await db.audioBlobs.get(track.id)) !== undefined,
    [track.id],
    false,
  )

  return (
    <div className="flex items-center gap-3 px-4 py-2 active:bg-white/5">
      <button onClick={onPress} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Artwork src={track.thumbnailUrl} className="h-12 w-12 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-[15px] font-medium', active && 'text-accent')}>
            {track.title}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[13px] text-neutral-400">
            {downloaded && <Icon name="downloaded" size={13} className="shrink-0 text-accent" />}
            <span className="truncate">
              {subtitle ?? `${track.artist} · ${formatDuration(track.durationSec)}`}
            </span>
          </p>
        </div>
      </button>
      {trailing}
      <button
        onClick={() => setMenuTrack(track)}
        className="shrink-0 p-2 text-neutral-400 active:text-white"
        aria-label="More options"
      >
        <Icon name="dots" size={18} />
      </button>
    </div>
  )
}
