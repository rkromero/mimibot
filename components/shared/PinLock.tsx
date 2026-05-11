'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const PIN_KEY = 'mimi_pin_v1'
const TIMEOUT_MS = 10 * 60 * 1000
const DIGITS = 4

type Props = {
  children: React.ReactNode
}

export default function PinLock({ children }: Props) {
  const [storedPin, setStoredPin] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [entry, setEntry] = useState('')
  const [error, setError] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load PIN from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(PIN_KEY)
    setStoredPin(saved)
    if (saved) setLocked(true)
  }, [])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setLocked(true), TIMEOUT_MS)
  }, [])

  // Attach activity listeners only when PIN is configured
  useEffect(() => {
    if (!storedPin) return
    const events = ['mousemove', 'touchstart', 'keydown', 'click', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [storedPin, resetTimer])

  function pressDigit(d: string) {
    if (entry.length >= DIGITS) return
    const next = entry + d
    setEntry(next)
    setError('')
    if (next.length === DIGITS) {
      if (next === storedPin) {
        setLocked(false)
        setEntry('')
        resetTimer()
      } else {
        setError('PIN incorrecto')
        setTimeout(() => setEntry(''), 600)
      }
    }
  }

  function pressBack() {
    setEntry((p) => p.slice(0, -1))
    setError('')
  }

  // No PIN → render children directly
  if (!storedPin || !locked) return <>{children}</>

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center px-8">
      <div className="w-full max-w-xs space-y-8 text-center">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Sesión bloqueada</h2>
          <p className="text-sm text-muted-foreground mt-1">Ingresá tu PIN para continuar</p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-4">
          {Array.from({ length: DIGITS }).map((_, i) => (
            <span
              key={i}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                entry.length > i
                  ? error
                    ? 'bg-destructive border-destructive'
                    : 'bg-primary border-primary'
                  : 'border-muted-foreground/40'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-sm text-destructive -mt-4">{error}</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => pressDigit(String(n))}
              className="h-14 rounded-2xl text-xl font-medium bg-muted hover:bg-accent active:scale-95 transition-all"
            >
              {n}
            </button>
          ))}
          <div />
          <button
            onClick={() => pressDigit('0')}
            className="h-14 rounded-2xl text-xl font-medium bg-muted hover:bg-accent active:scale-95 transition-all"
          >
            0
          </button>
          <button
            onClick={pressBack}
            className="h-14 rounded-2xl text-xl font-medium text-muted-foreground bg-muted hover:bg-accent active:scale-95 transition-all"
          >
            ←
          </button>
        </div>
      </div>
    </div>
  )
}
