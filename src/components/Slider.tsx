import { useState } from 'react'

interface SliderProps {
  value: number
  max: number
  onCommit: (value: number) => void
  className?: string
}

/**
 * Seek slider: shows live position while idle, but while the user drags it
 * shows the drag position and only commits on release (no fighting the
 * timeupdate stream).
 */
export function Slider({ value, max, onCommit, className }: SliderProps) {
  const [dragging, setDragging] = useState<number | null>(null)
  const shown = dragging ?? value
  const pct = max > 0 ? Math.min((shown / max) * 100, 100) : 0

  return (
    <input
      type="range"
      min={0}
      max={max || 1}
      step={0.1}
      value={shown}
      onChange={(e) => setDragging(Number(e.target.value))}
      onPointerUp={() => {
        if (dragging !== null) onCommit(dragging)
        setDragging(null)
      }}
      onKeyUp={() => {
        if (dragging !== null) onCommit(dragging)
        setDragging(null)
      }}
      className={className}
      style={{
        WebkitAppearance: 'none',
        height: 20,
        background: 'transparent',
        backgroundImage: `linear-gradient(to right, var(--color-accent) ${pct}%, #333 ${pct}%)`,
        backgroundSize: '100% 4px',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        borderRadius: 2,
      }}
    />
  )
}
