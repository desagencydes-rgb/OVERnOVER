export interface StorageHealth {
  usage: number
  quota: number
  persisted: boolean
}

export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storageHealth(): Promise<StorageHealth> {
  let usage = 0
  let quota = 0
  let persisted = false
  try {
    const est = await navigator.storage?.estimate?.()
    usage = est?.usage ?? 0
    quota = est?.quota ?? 0
  } catch {
    /* unsupported */
  }
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false
  } catch {
    /* unsupported */
  }
  return { usage, quota, persisted }
}
