import type { StreamInfo, Track } from '../models/types'
import { providerFor, type InstancePool } from './instances/pool'
import { ProviderError, type SourceProvider } from './types'

const MAX_ATTEMPTS = 5

/**
 * The provider the app actually uses: tries the healthiest instance, fails
 * over transparently, and feeds success/failure back into the pool's ranking.
 */
export class MultiProvider implements SourceProvider {
  constructor(private readonly pool: InstancePool) {}

  search(query: string, signal?: AbortSignal): Promise<Track[]> {
    return this.attempt((p) => p.search(query, signal), signal)
  }

  suggest(query: string, signal?: AbortSignal): Promise<string[]> {
    return this.attempt((p) => p.suggest(query, signal), signal)
  }

  streamInfo(videoId: string, signal?: AbortSignal): Promise<StreamInfo> {
    return this.attempt((p) => p.streamInfo(videoId, signal), signal)
  }

  related(videoId: string, signal?: AbortSignal): Promise<Track[]> {
    return this.attempt((p) => p.related(videoId, signal), signal)
  }

  private async attempt<T>(
    fn: (provider: SourceProvider) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const candidates = this.pool.ranked().slice(0, MAX_ATTEMPTS)
    if (candidates.length === 0) {
      throw new ProviderError('No instances configured — check Settings → Sources')
    }
    let lastError: unknown
    for (const state of candidates) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      try {
        const result = await fn(providerFor(state.instance))
        this.pool.reportSuccess(state.instance.url)
        return result
      } catch (err) {
        // The caller aborting (e.g. user kept typing) is not the instance's fault.
        if (signal?.aborted) throw err
        this.pool.reportFailure(state.instance.url)
        lastError = err
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ProviderError('All instances failed')
  }
}
