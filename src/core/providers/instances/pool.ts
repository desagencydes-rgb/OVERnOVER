import { getPref, getSetting, setSetting } from '../../storage/settings'
import type { Instance } from '../types'
import { InvidiousProvider } from '../invidious'
import { PipedProvider } from '../piped'
import type { SourceProvider } from '../types'

export interface InstanceState {
  instance: Instance
  /** null = never probed */
  ok: boolean | null
  latencyMs: number
  failCount: number
}

type PersistedHealth = Record<string, { ok: boolean | null; latencyMs: number; failCount: number }>

const HEALTH_KEY = 'instanceHealth'
const PROBE_TIMEOUT = 5000

export function providerFor(instance: Instance): SourceProvider {
  return instance.kind === 'piped'
    ? new PipedProvider(instance.url)
    : new InvidiousProvider(instance.url)
}

/** Healthy-and-fast first, then unknown, then failing (still retried last). */
export function rankInstances(states: InstanceState[]): InstanceState[] {
  const score = (s: InstanceState) => {
    if (s.ok === true) return s.latencyMs
    if (s.ok === null) return 100_000 + s.failCount
    return 1_000_000 + s.failCount * 1000
  }
  return [...states].sort((a, b) => score(a) - score(b))
}

export class InstancePool {
  private states: InstanceState[] = []
  private listeners = new Set<() => void>()

  constructor(seed: Instance[] = []) {
    this.setInstances(seed)
  }

  /** Load the instance list (bundled + remote-updatable) and persisted health. */
  async init(): Promise<void> {
    let instances: Instance[] = []
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}instances.json`, {
        cache: 'no-cache',
        signal: AbortSignal.timeout(PROBE_TIMEOUT),
      })
      if (res.ok) {
        const data = (await res.json()) as { instances?: Instance[] }
        instances = data.instances ?? []
      }
    } catch {
      /* offline start — pool stays empty; local playback is unaffected */
    }
    const custom = await getPref('customInstances')
    this.setInstances([...custom, ...instances])

    const health = await getSetting<PersistedHealth>(HEALTH_KEY, {})
    for (const s of this.states) {
      const h = health[s.instance.url]
      if (h) Object.assign(s, h)
    }
    this.notify()
  }

  setInstances(instances: Instance[]): void {
    const seen = new Set<string>()
    this.states = instances
      .filter((i) => {
        const key = i.url.replace(/\/$/, '')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((i) => ({
        instance: { ...i, url: i.url.replace(/\/$/, '') },
        ok: null,
        latencyMs: 0,
        failCount: 0,
      }))
  }

  ranked(): InstanceState[] {
    return rankInstances(this.states)
  }

  all(): InstanceState[] {
    return [...this.states]
  }

  reportSuccess(url: string): void {
    const s = this.find(url)
    if (!s) return
    s.ok = true
    s.failCount = 0
    this.persist()
    this.notify()
  }

  reportFailure(url: string): void {
    const s = this.find(url)
    if (!s) return
    s.failCount += 1
    if (s.failCount >= 2) s.ok = false
    this.persist()
    this.notify()
  }

  /** Probe every instance with the cheapest real request the app depends on. */
  async healthCheckAll(): Promise<void> {
    await Promise.allSettled(this.states.map((s) => this.probe(s)))
    this.persist()
    this.notify()
  }

  private async probe(state: InstanceState): Promise<void> {
    const started = performance.now()
    try {
      const timeout = AbortSignal.timeout(PROBE_TIMEOUT)
      await providerFor(state.instance).suggest('a', timeout)
      state.latencyMs = Math.round(performance.now() - started)
      state.ok = true
      state.failCount = 0
    } catch {
      state.ok = false
      state.failCount += 1
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private find(url: string): InstanceState | undefined {
    return this.states.find((s) => s.instance.url === url)
  }

  private notify(): void {
    for (const fn of this.listeners) fn()
  }

  private persist(): void {
    const health: PersistedHealth = {}
    for (const s of this.states) {
      health[s.instance.url] = { ok: s.ok, latencyMs: s.latencyMs, failCount: s.failCount }
    }
    void setSetting(HEALTH_KEY, health)
  }
}
