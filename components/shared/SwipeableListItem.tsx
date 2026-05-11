'use client'

import { useRef, useState, type ReactNode } from 'react'

type Action = {
  label: string
  icon?: ReactNode
  onClick: () => void
  className?: string
}

type Props = {
  children: ReactNode
  leftAction?: Action
  rightAction?: Action
  threshold?: number
}

export default function SwipeableListItem({
  children,
  leftAction,
  rightAction,
  threshold = 80,
}: Props) {
  const startXRef = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)

  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0]?.clientX ?? null
    setSwiping(true)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startXRef.current === null) return
    const dx = (e.touches[0]?.clientX ?? 0) - startXRef.current
    // Clamp: left action max +threshold, right action max -threshold
    const max = leftAction ? threshold + 16 : 0
    const min = rightAction ? -(threshold + 16) : 0
    setOffset(Math.max(min, Math.min(max, dx)))
  }

  function onTouchEnd() {
    setSwiping(false)
    if (offset >= threshold && leftAction) {
      leftAction.onClick()
    } else if (offset <= -threshold && rightAction) {
      rightAction.onClick()
    }
    setOffset(0)
    startXRef.current = null
  }

  const showLeft = offset > 16
  const showRight = offset < -16

  return (
    <div className="relative overflow-hidden">
      {/* Left action reveal */}
      {leftAction && (
        <div
          className={`absolute inset-y-0 left-0 flex items-center justify-center px-5 transition-opacity ${showLeft ? 'opacity-100' : 'opacity-0'} ${leftAction.className ?? 'bg-green-500 text-white'}`}
          style={{ width: threshold + 16 }}
        >
          <div className="flex flex-col items-center gap-1">
            {leftAction.icon}
            <span className="text-xs font-medium">{leftAction.label}</span>
          </div>
        </div>
      )}

      {/* Right action reveal */}
      {rightAction && (
        <div
          className={`absolute inset-y-0 right-0 flex items-center justify-center px-5 transition-opacity ${showRight ? 'opacity-100' : 'opacity-0'} ${rightAction.className ?? 'bg-red-500 text-white'}`}
          style={{ width: threshold + 16 }}
        >
          <div className="flex flex-col items-center gap-1">
            {rightAction.icon}
            <span className="text-xs font-medium">{rightAction.label}</span>
          </div>
        </div>
      )}

      {/* Main content */}
      <div
        className="relative bg-background"
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping ? 'none' : 'transform 0.25s ease',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
