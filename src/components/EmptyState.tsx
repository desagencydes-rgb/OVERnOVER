import { Icon, type IconName } from './Icon'

interface EmptyStateProps {
  icon: IconName
  title: string
  hint?: string
}

export function EmptyState({ icon, title, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <Icon name={icon} size={36} className="text-neutral-600" />
      <p className="text-[15px] font-medium text-neutral-300">{title}</p>
      {hint && <p className="text-[13px] text-neutral-500">{hint}</p>}
    </div>
  )
}
