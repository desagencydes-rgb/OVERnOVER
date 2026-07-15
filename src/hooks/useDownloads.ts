import { useStore } from 'zustand'
import { downloadsStore, type DownloadsSnapshot } from '../core/downloads/downloadsStore'

export function useDownloads<T>(selector: (state: DownloadsSnapshot) => T): T {
  return useStore(downloadsStore, selector)
}
