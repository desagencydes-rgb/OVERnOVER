import { db } from './db'

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value })
}

/** App-wide user preferences with their defaults. */
export const PREF_DEFAULTS = {
  autoRadio: true,
  autoDownloadFavorites: true,
  customInstances: [] as { url: string; kind: 'piped' | 'invidious' | 'companion' }[],
}

export type PrefKey = keyof typeof PREF_DEFAULTS

export async function getPref<K extends PrefKey>(key: K): Promise<(typeof PREF_DEFAULTS)[K]> {
  return getSetting(`pref:${key}`, PREF_DEFAULTS[key])
}

export async function setPref<K extends PrefKey>(
  key: K,
  value: (typeof PREF_DEFAULTS)[K],
): Promise<void> {
  await setSetting(`pref:${key}`, value)
}
