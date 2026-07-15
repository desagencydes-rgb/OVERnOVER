import { useStore } from 'zustand'
import { playerStore, type PlayerSnapshot } from '../core/player/playerStore'

export function usePlayer<T>(selector: (state: PlayerSnapshot) => T): T {
  return useStore(playerStore, selector)
}
