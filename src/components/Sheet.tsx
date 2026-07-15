import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'

interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Full-height sheet (player) vs bottom action sheet. */
  full?: boolean
}

/** Bottom sheet with slide-up transition. Renders nothing when fully closed. */
export function Sheet({ open, onClose, children, full = false }: SheetProps) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    } else {
      setShown(false)
      const t = setTimeout(() => setMounted(false), 250)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className={cn(
          'absolute inset-0 bg-black/60 transition-opacity duration-300',
          shown ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 transform transition-transform duration-300 ease-out',
          full ? 'top-0' : 'rounded-t-2xl bg-raised max-h-[85dvh] overflow-y-auto no-scrollbar',
          shown ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        {children}
      </div>
    </div>
  )
}
