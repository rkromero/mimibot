'use client'

import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildWhatsappLink } from '@/lib/whatsapp/messages'

type Variant = 'primary' | 'subtle' | 'icon'

type Props = {
  phone: string | null | undefined
  message: string
  /** Texto visible. Si se omite, el botón muestra solo el icono. */
  label?: string
  /** Estilo del botón. */
  variant?: Variant
  /** Clase extra para sobreescribir tamaños o spacing puntuales. */
  className?: string
  /** Si true, el botón se ve igual pero queda deshabilitado (sin teléfono). */
  disabledHint?: boolean
}

/**
 * Botón que abre WhatsApp (wa.me) con un mensaje pre-armado. Centraliza la
 * normalización del teléfono y el estilo verde de "salida a WhatsApp" usado
 * en éxito de pedido, éxito de cobro, lista de pedidos y morosos.
 *
 * Si el teléfono normalizado queda vacío, el botón se renderiza deshabilitado
 * con un tooltip explicativo para no confundir al vendedor con un link roto.
 */
export default function WhatsappLinkButton({
  phone,
  message,
  label,
  variant = 'primary',
  className,
  disabledHint,
}: Props) {
  const href = buildWhatsappLink(phone, message)
  const isDisabled = !href || disabledHint

  const base = 'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed'
  const stylesByVariant: Record<Variant, string> = {
    primary: cn(
      'min-h-[44px] px-4 py-3 rounded-xl text-base',
      isDisabled
        ? 'bg-muted text-muted-foreground opacity-50'
        : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
    ),
    subtle: cn(
      'min-h-[40px] px-3 py-2 rounded-lg text-sm border',
      isDisabled
        ? 'border-border bg-card text-muted-foreground opacity-50'
        : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40',
    ),
    icon: cn(
      'w-11 h-11 rounded-full',
      isDisabled
        ? 'bg-muted text-muted-foreground opacity-50'
        : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
    ),
  }

  if (isDisabled) {
    return (
      <button
        type="button"
        disabled
        title="Este cliente no tiene teléfono cargado"
        className={cn(base, stylesByVariant[variant], className)}
        aria-label={label ? `${label} (sin teléfono)` : 'WhatsApp (sin teléfono)'}
      >
        <MessageCircle size={variant === 'icon' ? 20 : 16} />
        {label && variant !== 'icon' && <span>{label}</span>}
      </button>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, stylesByVariant[variant], className)}
      aria-label={label ?? 'Enviar por WhatsApp'}
    >
      <MessageCircle size={variant === 'icon' ? 20 : 16} />
      {label && variant !== 'icon' && <span>{label}</span>}
    </a>
  )
}
