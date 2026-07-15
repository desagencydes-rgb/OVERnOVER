import type { RepeatMode } from '../models/types'

export interface QueuePosition {
  length: number
  index: number
  repeat: RepeatMode
}

/**
 * Index to play after the current track finishes naturally.
 * null = queue exhausted (caller may extend via radio or stop).
 * repeat 'one' is handled by the engine replaying — advancing past it
 * (explicit next tap) behaves like 'off'.
 */
export function nextIndex({ length, index, repeat }: QueuePosition): number | null {
  if (length === 0) return null
  if (index + 1 < length) return index + 1
  return repeat === 'all' ? 0 : null
}

export function prevIndex({ length, index, repeat }: QueuePosition): number | null {
  if (length === 0) return null
  if (index > 0) return index - 1
  return repeat === 'all' ? length - 1 : null
}

/**
 * Shuffle only the tracks after the current one, keeping played order intact.
 * `random` is injectable for tests.
 */
export function shuffleUpcoming<T>(
  queue: T[],
  currentIndex: number,
  random: () => number = Math.random,
): T[] {
  const head = queue.slice(0, currentIndex + 1)
  const tail = queue.slice(currentIndex + 1)
  for (let i = tail.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[tail[i], tail[j]] = [tail[j], tail[i]]
  }
  return [...head, ...tail]
}
