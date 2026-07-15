import { createStore } from 'zustand/vanilla'

export interface DownloadsSnapshot {
  activeId: string | null
  received: number
  total: number
  queuedIds: string[]
  errors: Record<string, string>
}

export const downloadsStore = createStore<DownloadsSnapshot>(() => ({
  activeId: null,
  received: 0,
  total: 0,
  queuedIds: [],
  errors: {},
}))
