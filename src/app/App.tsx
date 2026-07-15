import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { boot } from './boot'
import { TabBar } from './TabBar'
import { useUiStore } from '../state/uiStore'
import { HomeView } from '../features/home/HomeView'
import { SearchView } from '../features/search/SearchView'
import { LibraryView } from '../features/library/LibraryView'
import { SettingsView } from '../features/settings/SettingsView'
import { MiniPlayer } from '../features/player/MiniPlayer'
import { FullPlayer } from '../features/player/FullPlayer'
import { QueueSheet } from '../features/player/QueueSheet'
import { TrackMenu } from '../features/player/TrackMenu'
import { PlaylistPicker } from '../features/playlists/PlaylistPicker'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false },
  },
})

function Toast() {
  const toast = useUiStore((s) => s.toast)
  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-32 z-[60] flex justify-center">
      <p className="rounded-full bg-neutral-700 px-4 py-2 text-[13px] font-medium shadow-lg">
        {toast}
      </p>
    </div>
  )
}

export function App() {
  const tab = useUiStore((s) => s.tab)

  useEffect(() => {
    void boot()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-dvh flex-col">
        <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {tab === 'home' && <HomeView />}
          {tab === 'search' && <SearchView />}
          {tab === 'library' && <LibraryView />}
          {tab === 'settings' && <SettingsView />}
        </main>
        <MiniPlayer />
        <TabBar />
      </div>
      <FullPlayer />
      <QueueSheet />
      <TrackMenu />
      <PlaylistPicker />
      <Toast />
    </QueryClientProvider>
  )
}
