import { cn } from '../lib/cn'
import { Icon, type IconName } from '../components/Icon'
import { useUiStore, type Tab } from '../state/uiStore'

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'search', label: 'Search', icon: 'search' },
  { key: 'library', label: 'Library', icon: 'library' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
]

export function TabBar() {
  const tab = useUiStore((s) => s.tab)
  const setTab = useUiStore((s) => s.setTab)

  return (
    <nav className="pb-safe flex border-t border-white/10 bg-surface/95 backdrop-blur">
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={cn(
            'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
            tab === t.key ? 'text-white' : 'text-neutral-500',
          )}
        >
          <Icon name={t.icon} size={22} />
          {t.label}
        </button>
      ))}
    </nav>
  )
}
