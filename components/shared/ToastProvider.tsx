'use client'

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning'

type Toast = {
  id: string
  type: ToastType
  message: string
  duration: number
}

type Action =
  | { type: 'ADD'; toast: Toast }
  | { type: 'REMOVE'; id: string }

// ── Context ───────────────────────────────────────────────────────────────────

const ToastCtx = createContext<{
  add: (type: ToastType, message: string, duration?: number) => void
}>({ add: () => {} })

function reducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case 'ADD':
      return [...state.slice(-4), action.toast]
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id)
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, [])

  const add = useCallback((type: ToastType, message: string, duration = 3500) => {
    const id = Math.random().toString(36).slice(2, 9)
    dispatch({ type: 'ADD', toast: { id, type, message, duration } })
  }, [])

  const remove = useCallback((id: string) => dispatch({ type: 'REMOVE', id }), [])

  return (
    <ToastCtx.Provider value={{ add }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastCtx.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const { add } = useContext(ToastCtx)
  return {
    success: (msg: string, dur?: number) => add('success', msg, dur),
    error: (msg: string, dur?: number) => add('error', msg, dur),
    info: (msg: string, dur?: number) => add('info', msg, dur),
    warning: (msg: string, dur?: number) => add('warning', msg, dur),
  }
}

// ── UI ────────────────────────────────────────────────────────────────────────

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle size={16} className="shrink-0" />,
  error: <XCircle size={16} className="shrink-0" />,
  info: <Info size={16} className="shrink-0" />,
  warning: <AlertTriangle size={16} className="shrink-0" />,
}

const COLORS: Record<ToastType, string> = {
  success: 'bg-green-500 text-white',
  error: 'bg-destructive text-destructive-foreground',
  info: 'bg-primary text-primary-foreground',
  warning: 'bg-amber-500 text-white',
}

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast
  onRemove: (id: string) => void
}) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), toast.duration)
    return () => clearTimeout(t)
  }, [toast.id, toast.duration, onRemove])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg pointer-events-auto
        animate-in slide-in-from-right-4 fade-in duration-200
        ${COLORS[toast.type]}`}
    >
      {ICONS[toast.type]}
      <p className="text-sm flex-1 font-medium">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="opacity-70 hover:opacity-100 transition-opacity p-0.5 -mr-1"
        aria-label="Cerrar"
      >
        <X size={14} />
      </button>
    </div>
  )
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[]
  onRemove: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-[5.5rem] md:bottom-4 right-4 z-[300] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  )
}
