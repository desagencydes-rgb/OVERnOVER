import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstancePool, rankInstances } from '../src/core/providers/instances/pool'
import { MultiProvider } from '../src/core/providers/multi'

afterEach(() => vi.unstubAllGlobals())

const state = (url: string, ok: boolean | null, latencyMs = 100, failCount = 0) => ({
  instance: { url, kind: 'piped' as const },
  ok,
  latencyMs,
  failCount,
})

describe('rankInstances', () => {
  it('orders healthy-fast, healthy-slow, unknown, failed', () => {
    const ranked = rankInstances([
      state('https://failed', false, 0, 3),
      state('https://unknown', null),
      state('https://slow', true, 900),
      state('https://fast', true, 80),
    ])
    expect(ranked.map((s) => s.instance.url)).toEqual([
      'https://fast',
      'https://slow',
      'https://unknown',
      'https://failed',
    ])
  })
})

describe('MultiProvider failover', () => {
  it('falls over to the next instance and reports health', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('bad.example')) throw new TypeError('network down')
        return {
          ok: true,
          json: async () => ({
            items: [{ url: '/watch?v=ok1234567ab', type: 'stream', title: 'Hit', duration: 60 }],
          }),
        }
      }) as unknown as typeof fetch,
    )

    const pool = new InstancePool([
      { url: 'https://bad.example', kind: 'piped' },
      { url: 'https://good.example', kind: 'piped' },
    ])
    const provider = new MultiProvider(pool)

    const tracks = await provider.search('anything')
    expect(tracks).toHaveLength(1)

    const bad = pool.all().find((s) => s.instance.url === 'https://bad.example')
    const good = pool.all().find((s) => s.instance.url === 'https://good.example')
    expect(bad?.failCount).toBeGreaterThan(0)
    expect(good?.ok).toBe(true)
  })

  it('throws the last error when every instance fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('everything is down')
      }) as unknown as typeof fetch,
    )
    const pool = new InstancePool([
      { url: 'https://a.example', kind: 'piped' },
      { url: 'https://b.example', kind: 'invidious' },
    ])
    const provider = new MultiProvider(pool)
    await expect(provider.suggest('x')).rejects.toThrow('everything is down')
  })

  it('fails fast with no instances', async () => {
    const provider = new MultiProvider(new InstancePool([]))
    await expect(provider.search('x')).rejects.toThrow(/No instances/)
  })
})
