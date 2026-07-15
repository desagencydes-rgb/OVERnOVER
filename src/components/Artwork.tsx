import { useState } from 'react'
import { cn } from '../lib/cn'
import { Icon } from './Icon'

interface ArtworkProps {
  src: string
  alt?: string
  className?: string
}

/** Track/playlist artwork with graceful fallback when offline or missing. */
export function Artwork({ src, alt = '', className }: ArtworkProps) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-neutral-800 text-neutral-500',
          className,
        )}
      >
        <Icon name="music" size={20} />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  )
}
