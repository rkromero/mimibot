'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export default function BottomSheet({ open, onClose, title, children }: Props) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col justify-end transition-opacity duration-300',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
      aria-hidden={!open}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full bg-card rounded-t-2xl shadow-xl p-4',
          'max-h-[90dvh] overflow-y-auto',
          'transition-transform duration-300 ease-out',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="w-8 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-3" />

        {title && (
          <h2 className="text-base font-semibold mb-3">{title}</h2>
        )}

        <div className="pb-safe">
          {children}
        </div>
      </div>
    </div>
  )
}
