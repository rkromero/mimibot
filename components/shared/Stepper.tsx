'use client'

import { ArrowLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  steps: string[]
  currentStep: number
  onBack?: () => void
  onClose?: () => void
}

export default function Stepper({ steps, currentStep, onBack, onClose }: Props) {
  const handleLeft = () => {
    if (currentStep > 0) {
      onBack?.()
    } else {
      onClose?.()
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 pt-3 pb-2 border-b border-border bg-card shrink-0">
      {/* Header row */}
      <div className="flex items-center">
        {/* Left: back or close */}
        <button
          onClick={handleLeft}
          className="flex items-center justify-center w-11 h-11 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={currentStep > 0 ? 'Volver' : 'Cerrar'}
        >
          <ArrowLeft size={20} />
        </button>

        {/* Center: step label */}
        <span className="flex-1 text-center text-sm font-medium text-foreground">
          {steps[currentStep] ?? ''}
        </span>

        {/* Right: close */}
        <button
          onClick={onClose}
          className="flex items-center justify-center w-11 h-11 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {steps.map((_, index) => (
          <div
            key={index}
            className={cn(
              'flex-1 h-1 rounded-full transition-all duration-300',
              index <= currentStep ? 'bg-primary' : 'bg-muted'
            )}
          />
        ))}
      </div>
    </div>
  )
}
