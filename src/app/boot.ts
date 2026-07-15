import { pool } from '../core/providers'
import { player } from '../core/player/engine'
import { downloads } from '../core/downloads/manager'
import { requestPersistence } from '../core/storage/quota'

let booted = false

/** One-time app startup: fast path first (restore state), network after. */
export async function boot(): Promise<void> {
  if (booted) return
  booted = true

  await player.restore()

  void pool.init().then(() => pool.healthCheckAll())
  void downloads.resume()
  void requestPersistence()

  window.addEventListener('online', () => void downloads.tick())
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) player.persistNow()
  })
}
