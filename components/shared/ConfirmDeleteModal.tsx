'use client'

import { ArrowLeft, X, Trash2, AlertCircle } from 'lucide-react'

type Props = {
  title: string
  description: string
  /** Extra info rendered below the description (e.g. counters). */
  details?: React.ReactNode
  warning?: string
  onConfirm: () => void
  onClose: () => void
  isPending?: boolean
  /** When true the confirm button is rendered disabled with aria-disabled. */
  confirmDisabled?: boolean
  /** Shown as tooltip on the button wrapper and as a hint text below. */
  confirmDisabledReason?: string
}

export default function ConfirmDeleteModal({
  title,
  description,
  details,
  warning,
  onConfirm,
  onClose,
  isPending = false,
  confirmDisabled = false,
  confirmDisabledReason,
}: Props) {
  const isConfirmBlocked = confirmDisabled || isPending

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:bg-black/50 md:items-center md:justify-center">
      <div className="absolute inset-0 hidden md:block" onClick={onClose} />

      <div className="relative flex flex-col h-full w-full bg-card md:h-auto md:rounded-lg md:border md:border-border md:shadow-xl md:max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
          <button onClick={onClose} className="md:hidden p-2 -ml-2 text-muted-foreground">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-base md:text-sm font-semibold text-foreground">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="hidden md:block p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 md:flex-none overflow-y-auto p-4 space-y-4">
          <p className="text-sm text-foreground">{description}</p>

          {details && (
            <div className="p-3 rounded-lg bg-muted border border-border text-sm text-foreground space-y-1">
              {details}
            </div>
          )}

          {warning && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-300">{warning}</p>
            </div>
          )}
        </div>

        {/* Actions — sticky bottom on mobile, inline on desktop */}
        <div className="p-4 border-t border-border bg-card shrink-0 flex flex-col gap-3 md:flex-row-reverse md:gap-2">
          {/* Tooltip wrapper: title shows on hover even when button is disabled */}
          <div
            title={confirmDisabled && confirmDisabledReason ? confirmDisabledReason : undefined}
            className={confirmDisabled ? 'cursor-not-allowed w-full md:w-auto' : 'w-full md:w-auto'}
          >
            <button
              onClick={isConfirmBlocked ? undefined : onConfirm}
              disabled={isConfirmBlocked}
              aria-disabled={isConfirmBlocked}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 md:py-1.5 bg-destructive text-destructive-foreground rounded-xl md:rounded-md text-base md:text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <Trash2 size={16} />
              {isPending ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>

          {/* Visible hint when confirm is blocked */}
          {confirmDisabled && confirmDisabledReason && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground md:hidden">
              <AlertCircle size={12} />
              {confirmDisabledReason}
            </p>
          )}

          <button
            onClick={onClose}
            disabled={isPending}
            className="w-full md:w-auto px-4 py-3 md:py-1.5 border border-border rounded-xl md:rounded-md text-base md:text-sm font-medium text-foreground bg-card hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>

        {/* Desktop: hint below actions when confirm is blocked */}
        {confirmDisabled && confirmDisabledReason && (
          <div className="hidden md:flex items-center justify-end gap-1.5 px-4 pb-3 text-xs text-muted-foreground">
            <AlertCircle size={11} />
            {confirmDisabledReason}
          </div>
        )}
      </div>
    </div>
  )
}
