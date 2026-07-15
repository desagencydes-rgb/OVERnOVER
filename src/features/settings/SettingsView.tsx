import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/storage/db'
import { pool } from '../../core/providers'
import {
  getPref,
  PREF_DEFAULTS,
  setPref,
  type PrefKey,
} from '../../core/storage/settings'
import { storageHealth, type StorageHealth } from '../../core/storage/quota'
import { exportLibrary, importLibrary, type LibraryExport } from '../../core/library/service'
import { formatBytes } from '../../lib/format'
import { cn } from '../../lib/cn'
import { useUiStore } from '../../state/uiStore'
import { Icon } from '../../components/Icon'

export function SettingsView() {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="pt-safe px-4">
        <h1 className="py-3 text-2xl font-bold">Settings</h1>
      </div>
      <StorageSection />
      <PlaybackSection />
      <SourcesSection />
      <DataSection />
      <p className="px-4 text-center text-[12px] text-neutral-600">
        OVERnOVER · personal build · v{__APP_VERSION__}
      </p>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-4 pb-2 text-[13px] font-semibold uppercase tracking-wide text-neutral-500">
      {children}
    </h2>
  )
}

function StorageSection() {
  const [health, setHealth] = useState<StorageHealth | null>(null)
  const downloadedCount = useLiveQuery(() => db.audioBlobs.count(), [], 0)

  useEffect(() => {
    void storageHealth().then(setHealth)
  }, [downloadedCount])

  const pct = health && health.quota > 0 ? (health.usage / health.quota) * 100 : 0

  return (
    <section>
      <SectionTitle>Storage</SectionTitle>
      <div className="mx-4 rounded-xl bg-raised p-4">
        <div className="h-2 overflow-hidden rounded-full bg-neutral-700">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <p className="mt-2 text-[13px] text-neutral-400">
          {health ? `${formatBytes(health.usage)} of ${formatBytes(health.quota)} available used` : '…'}
        </p>
        <p className="mt-1 text-[13px] text-neutral-500">
          {downloadedCount} saved tracks ·{' '}
          {health?.persisted
            ? 'Storage is protected from eviction ✓'
            : 'Storage not yet persistent — keep using the app from your Home Screen'}
        </p>
      </div>
    </section>
  )
}

function Toggle({ prefKey, label, hint }: { prefKey: PrefKey; label: string; hint: string }) {
  const value = useLiveQuery(() => getPref(prefKey), [prefKey], PREF_DEFAULTS[prefKey])
  const on = Boolean(value)
  return (
    <button
      onClick={() => void setPref(prefKey, !on as never)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/5"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{label}</span>
        <span className="block text-[13px] text-neutral-500">{hint}</span>
      </span>
      <span
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          on ? 'bg-accent' : 'bg-neutral-700',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform',
            on ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

function PlaybackSection() {
  return (
    <section>
      <SectionTitle>Playback</SectionTitle>
      <Toggle
        prefKey="autoRadio"
        label="Autoplay related music"
        hint="Keep playing similar tracks when the queue ends"
      />
      <Toggle
        prefKey="autoDownloadFavorites"
        label="Auto-save favorites"
        hint="Download tracks for offline when you favorite them"
      />
    </section>
  )
}

function SourcesSection() {
  const [checking, setChecking] = useState(false)
  const states = useSyncExternalStore(
    useCallback((cb: () => void) => pool.subscribe(cb), []),
    () => pool.all(),
  )

  const addCustom = async (kind: 'piped' | 'invidious') => {
    const url = prompt(`${kind === 'piped' ? 'Piped API' : 'Invidious'} instance URL`, 'https://')
    if (!url || !url.startsWith('http')) return
    const custom = await getPref('customInstances')
    await setPref('customInstances', [...custom, { url: url.replace(/\/$/, ''), kind }])
    await pool.init()
    void pool.healthCheckAll()
  }

  return (
    <section>
      <SectionTitle>Sources</SectionTitle>
      <div className="px-4 text-[13px] text-neutral-500">
        Community servers used for search and streaming. Saved tracks never depend on them.
      </div>
      <div className="mx-4 mt-2 rounded-xl bg-raised">
        {states.map((s) => (
          <div
            key={s.instance.url}
            className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0"
          >
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                s.ok === true ? 'bg-green-400' : s.ok === false ? 'bg-red-400' : 'bg-neutral-500',
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {s.instance.url.replace(/^https?:\/\//, '')}
            </span>
            <span className="shrink-0 text-[12px] text-neutral-500">
              {s.instance.kind}
              {s.ok === true && ` · ${s.latencyMs}ms`}
            </span>
          </div>
        ))}
        {states.length === 0 && (
          <p className="px-4 py-3 text-[13px] text-neutral-500">
            No sources loaded — are you offline?
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        <button
          onClick={() => {
            setChecking(true)
            void pool.healthCheckAll().finally(() => setChecking(false))
          }}
          className="flex items-center gap-2 rounded-full bg-raised px-4 py-2 text-[13px] font-medium"
        >
          <Icon name="refresh" size={14} className={checking ? 'animate-spin' : ''} />
          Test all
        </button>
        <button
          onClick={() => void addCustom('piped')}
          className="rounded-full bg-raised px-4 py-2 text-[13px] font-medium"
        >
          + Piped
        </button>
        <button
          onClick={() => void addCustom('invidious')}
          className="rounded-full bg-raised px-4 py-2 text-[13px] font-medium"
        >
          + Invidious
        </button>
      </div>
    </section>
  )
}

function DataSection() {
  const showToast = useUiStore((s) => s.showToast)
  const fileRef = useRef<HTMLInputElement>(null)

  const doExport = async () => {
    const data = await exportLibrary()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `overnover-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as LibraryExport
      await importLibrary(data)
      showToast('Library imported')
    } catch {
      showToast('Import failed — not a valid backup')
    }
  }

  return (
    <section>
      <SectionTitle>Data</SectionTitle>
      <button
        onClick={() => void doExport()}
        className="w-full px-4 py-3 text-left text-[15px] active:bg-white/5"
      >
        Export library backup
        <span className="block text-[13px] text-neutral-500">
          Playlists, favorites and track list as JSON — save it to iCloud Files
        </span>
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full px-4 py-3 text-left text-[15px] active:bg-white/5"
      >
        Import library backup
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void doImport(f)
          e.target.value = ''
        }}
      />
    </section>
  )
}
