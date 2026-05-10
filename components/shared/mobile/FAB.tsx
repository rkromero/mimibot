'use client'

import { Plus } from 'lucide-react'

type Props = {
  onClick: () => void
  label?: string
}

export default function FAB({ onClick, label }: Props) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-[76px] right-4 z-30 flex items-center gap-2 h-14 rounded-full bg-primary text-primary-foreground shadow-lg px-5 md:hidden active:scale-95 transition-transform animate-fade-in"
      aria-label={label ?? 'Agregar'}
    >
      <Plus size={20} strokeWidth={2} />
      {label && <span className="text-sm font-semibold pr-1">{label}</span>}
    </button>
  )
}
