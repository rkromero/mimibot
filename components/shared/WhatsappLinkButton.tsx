'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'subtle' | 'icon'

type Props = {
  clienteId?: string
  phone?: string | null | undefined
  label?: string
  variant?: Variant
  className?: string
}

export default function WhatsappLinkButton({
  clienteId,
  phone,
  label,
  variant = 'primary',
  className,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const isDisabled = !clienteId || !phone

  const base = 'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed'
  const stylesByVariant: Record<Variant, string> = {
    primary: cn(
      'min-h-[44px] px-4 py-3 rounded-xl text-base',
      isDisabled || loading
        ? 'bg-muted text-muted-foreground opacity-50'
        : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
    ),
    subtle: cn(
      'min-h-[40px] px-3 py-2 rounded-lg text-sm border',
      isDisabled || loading
        ? 'border-border bg-card text-muted-foreground opacity-50'
        : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40',
    ),
    icon: cn(
      'w-11 h-11 rounded-full',
      isDisabled || loading
        ? 'bg-muted text-muted-foreground opacity-50'
        : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
    ),
  }

  async function handleClick() {
    if (!clienteId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/clientes/${clienteId}/conversacion`, { method: 'POST' })
      if (!res.ok) return
      const json = await res.json() as { data: { conversationId: string } }
      router.push(`/inbox?conversation=${json.data.conversationId}`)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={isDisabled || loading}
      title={isDisabled ? 'Este cliente no tiene teléfono cargado' : undefined}
      className={cn(base, stylesByVariant[variant], className)}
      aria-label={label ? `${label}${isDisabled ? ' (sin teléfono)' : ''}` : 'Enviar por WhatsApp'}
    >
      <MessageCircle size={variant === 'icon' ? 20 : 16} />
      {label && variant !== 'icon' && <span>{label}</span>}
    </button>
  )
}
