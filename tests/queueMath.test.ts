import { describe, expect, it } from 'vitest'
import { nextIndex, prevIndex, shuffleUpcoming } from '../src/core/player/queueMath'

describe('nextIndex', () => {
  it('advances within the queue', () => {
    expect(nextIndex({ length: 5, index: 2, repeat: 'off' })).toBe(3)
  })
  it('stops at the end with repeat off', () => {
    expect(nextIndex({ length: 5, index: 4, repeat: 'off' })).toBeNull()
  })
  it('wraps with repeat all', () => {
    expect(nextIndex({ length: 5, index: 4, repeat: 'all' })).toBe(0)
  })
  it('handles the empty queue', () => {
    expect(nextIndex({ length: 0, index: 0, repeat: 'all' })).toBeNull()
  })
})

describe('prevIndex', () => {
  it('goes back within the queue', () => {
    expect(prevIndex({ length: 5, index: 2, repeat: 'off' })).toBe(1)
  })
  it('stops at the start with repeat off', () => {
    expect(prevIndex({ length: 5, index: 0, repeat: 'off' })).toBeNull()
  })
  it('wraps to the end with repeat all', () => {
    expect(prevIndex({ length: 5, index: 0, repeat: 'all' })).toBe(4)
  })
})

describe('shuffleUpcoming', () => {
  const queue = ['a', 'b', 'c', 'd', 'e']

  it('keeps current and already-played order intact', () => {
    const shuffled = shuffleUpcoming(queue, 2, () => 0.99)
    expect(shuffled.slice(0, 3)).toEqual(['a', 'b', 'c'])
  })

  it('keeps the same set of upcoming tracks', () => {
    const shuffled = shuffleUpcoming(queue, 1, () => 0.4)
    expect([...shuffled].sort()).toEqual([...queue].sort())
    expect(shuffled).toHaveLength(queue.length)
  })

  it('actually reorders the tail', () => {
    const shuffled = shuffleUpcoming(queue, 0, () => 0)
    expect(shuffled[0]).toBe('a')
    expect(shuffled.slice(1)).not.toEqual(['b', 'c', 'd', 'e'])
  })
})
