import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/storage/db'
import { player } from '../../core/player/engine'
import type { Track } from '../../core/models/types'
import { Artwork } from '../../components/Artwork'
import { EmptyState } from '../../components/EmptyState'
import { TrackRow } from '../../components/TrackRow'
import { useUiStore } from '../../state/uiStore'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Late night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomeView() {
  const setTab = useUiStore((s) => s.setTab)

  const recents = useLiveQuery(async () => {
    const entries = await db.history.orderBy('playedAt').reverse().limit(60).toArray()
    const seen = new Set<string>()
    const ids: string[] = []
    for (const e of entries) {
      if (!seen.has(e.trackId)) {
        seen.add(e.trackId)
        ids.push(e.trackId)
      }
      if (ids.length >= 12) break
    }
    const tracks = await db.tracks.bulkGet(ids)
    return tracks.filter((t): t is Track => t !== undefined)
  }, [], [])

  const mostPlayed = useLiveQuery(async () => {
    const tracks = await db.tracks.orderBy('playCount').reverse().limit(12).toArray()
    return tracks.filter((t) => t.playCount > 1)
  }, [], [])

  const hasContent = (recents?.length ?? 0) > 0 || (mostPlayed?.length ?? 0) > 0

  return (
    <div className="flex flex-col pb-4">
      <div className="pt-safe px-4">
        <h1 className="py-3 text-2xl font-bold">{greeting()}</h1>
      </div>

      {!hasContent && (
        <EmptyState
          icon="music"
          title="Nothing here yet"
          hint="Search for a song to start building your library."
        />
      )}
      {!hasContent && (
        <button
          onClick={() => setTab('search')}
          className="mx-auto rounded-full bg-accent px-6 py-2.5 text-[15px] font-semibold text-white active:opacity-80"
        >
          Start searching
        </button>
      )}

      {(recents?.length ?? 0) > 0 && (
        <section>
          <h2 className="px-4 pb-2 pt-2 text-[17px] font-semibold">Recently played</h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4">
            {recents!.map((t, i) => (
              <button
                key={t.id}
                onClick={() => void player.playQueue(recents!, i)}
                className="w-28 shrink-0 text-left active:opacity-70"
              >
                <Artwork src={t.thumbnailUrl} className="h-28 w-28 rounded-lg" />
                <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-tight">
                  {t.title}
                </p>
                <p className="truncate text-[12px] text-neutral-500">{t.artist}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {(mostPlayed?.length ?? 0) > 0 && (
        <section className="mt-4">
          <h2 className="px-4 pb-1 text-[17px] font-semibold">On repeat</h2>
          {mostPlayed!.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              subtitle={`${t.artist} · ${t.playCount} plays`}
              onPress={() => void player.playQueue(mostPlayed!, i)}
            />
          ))}
        </section>
      )}
    </div>
  )
}
