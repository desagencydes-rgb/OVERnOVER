import { createStore } from 'zustand/vanilla'
import type { RepeatMode, Track } from '../models/types'

export interface PlayerSnapshot {
  queue: Track[]
  index: number
  isPlaying: boolean
  buffering: boolean
  position: number
  duration: number
  repeat: RepeatMode
  shuffle: boolean
  /** Queue order before shuffle was enabled, to restore on toggle-off. */
  preShuffleQueue: Track[] | null
  error: string | null
}

export const playerStore = createStore<PlayerSnapshot>(() => ({
  queue: [],
  index: 0,
  isPlaying: false,
  buffering: false,
  position: 0,
  duration: 0,
  repeat: 'off',
  shuffle: false,
  preShuffleQueue: null,
  error: null,
}))

export function currentTrack(state: PlayerSnapshot): Track | null {
  return state.queue[state.index] ?? null
}
