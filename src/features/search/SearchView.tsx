import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import Fuse from 'fuse.js'
import { provider } from '../../core/providers'
import { db } from '../../core/storage/db'
import { player } from '../../core/player/engine'
import type { Track } from '../../core/models/types'
import { useDebounced } from '../../hooks/useDebounced'
import { useOnline } from '../../hooks/useOnline'
import { useUiStore } from '../../state/uiStore'
import { TrackRow } from '../../components/TrackRow'
import { EmptyState } from '../../components/EmptyState'
import { Icon } from '../../components/Icon'

export function SearchView() {
  const query = useUiStore((s) => s.searchQuery)
  const setQuery = useUiStore((s) => s.setSearchQuery)
  const online = useOnline()
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounced = useDebounced(query.trim(), 350)

  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: ({ signal }) => provider.search(debounced, signal),
    enabled: online && debounced.length >= 2,
    staleTime: 10 * 60 * 1000,
    retry: false, // MultiProvider already fails over across instances
  })

  const suggestions = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: ({ signal }) => provider.suggest(debounced, signal),
    enabled: online && focused && debounced.length >= 2,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  const libraryTracks = useLiveQuery(() => db.tracks.where('addedAt').above(0).toArray(), [], [])
  const fuse = useMemo(
    () =>
      new Fuse(libraryTracks ?? [], {
        keys: ['title', 'artist'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [libraryTracks],
  )
  const localMatches = useMemo(
    () => (debounced.length >= 2 ? fuse.search(debounced).map((r) => r.item).slice(0, 5) : []),
    [fuse, debounced],
  )

  const play = (list: Track[], index: number) => {
    void player.playQueue(list, index)
  }

  const showSuggestions =
    focused && (suggestions.data?.length ?? 0) > 0 && debounced !== '' && !results.data

  return (
    <div className="flex flex-col">
      <div className="pt-safe sticky top-0 z-10 bg-surface/95 px-4 pb-2 backdrop-blur">
        <h1 className="py-3 text-2xl font-bold">Search</h1>
        <div className="flex items-center gap-2 rounded-xl bg-raised px-3 py-2.5">
          <Icon name="search" size={18} className="shrink-0 text-neutral-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Songs, artists…"
            inputMode="search"
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-neutral-500"
          />
          {query && (
            <button onClick={() => setQuery('')} className="shrink-0 text-neutral-400">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
        {!online && (
          <p className="mt-2 inline-block rounded-full bg-raised px-3 py-1 text-[12px] text-neutral-400">
            Offline — searching your library
          </p>
        )}
      </div>

      {showSuggestions && (
        <div className="px-4">
          {suggestions.data!.slice(0, 6).map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuery(s)
                inputRef.current?.blur()
              }}
              className="flex w-full items-center gap-3 py-2.5 text-left text-[15px] text-neutral-300"
            >
              <Icon name="search" size={15} className="shrink-0 text-neutral-500" />
              {s}
            </button>
          ))}
        </div>
      )}

      {localMatches.length > 0 && (
        <section>
          <h2 className="px-4 pb-1 pt-3 text-[13px] font-semibold uppercase tracking-wide text-neutral-500">
            Your library
          </h2>
          {localMatches.map((t, i) => (
            <TrackRow key={t.id} track={t} onPress={() => play(localMatches, i)} />
          ))}
        </section>
      )}

      {online && debounced.length >= 2 && (
        <section className="pb-4">
          <h2 className="px-4 pb-1 pt-3 text-[13px] font-semibold uppercase tracking-wide text-neutral-500">
            Results
          </h2>
          {results.isLoading && (
            <p className="px-4 py-6 text-center text-[14px] text-neutral-500">Searching…</p>
          )}
          {results.isError && (
            <EmptyState
              icon="refresh"
              title="Search failed"
              hint="All sources are unreachable right now. Try again in a bit or check Settings → Sources."
            />
          )}
          {results.data?.map((t, i) => (
            <TrackRow key={`${t.id}-${i}`} track={t} onPress={() => play(results.data!, i)} />
          ))}
          {results.data?.length === 0 && (
            <EmptyState icon="search" title="No results" hint="Try a different spelling." />
          )}
        </section>
      )}

      {debounced.length < 2 && localMatches.length === 0 && (
        <EmptyState
          icon="search"
          title="Find something to play"
          hint="Search all of YouTube. Saved tracks appear even offline."
        />
      )}
    </div>
  )
}
