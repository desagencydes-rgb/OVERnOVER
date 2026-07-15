import { create } from 'zustand'
import type { Track } from '../core/models/types'

export type Tab = 'home' | 'search' | 'library' | 'settings'

interface UiState {
  tab: Tab
  playerOpen: boolean
  queueOpen: boolean
  /** Track whose ⋯ action sheet is open. */
  menuTrack: Track | null
  /** Track being added to a playlist. */
  playlistPickerTrack: Track | null
  searchQuery: string
  toast: string | null
  setTab: (tab: Tab) => void
  setPlayerOpen: (open: boolean) => void
  setQueueOpen: (open: boolean) => void
  setMenuTrack: (track: Track | null) => void
  setPlaylistPickerTrack: (track: Track | null) => void
  setSearchQuery: (q: string) => void
  showToast: (message: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useUiStore = create<UiState>((set) => ({
  tab: 'home',
  playerOpen: false,
  queueOpen: false,
  menuTrack: null,
  playlistPickerTrack: null,
  searchQuery: '',
  toast: null,
  setTab: (tab) => set({ tab }),
  setPlayerOpen: (playerOpen) => set({ playerOpen }),
  setQueueOpen: (queueOpen) => set({ queueOpen }),
  setMenuTrack: (menuTrack) => set({ menuTrack }),
  setPlaylistPickerTrack: (playlistPickerTrack) => set({ playlistPickerTrack }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  showToast: (toast) => {
    clearTimeout(toastTimer)
    set({ toast })
    toastTimer = setTimeout(() => set({ toast: null }), 2200)
  },
}))
