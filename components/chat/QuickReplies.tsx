'use client'

import { useQuery } from '@tanstack/react-query'
import BottomSheet from '@/components/shared/BottomSheet'

type Template = {
  id: string
  nombre: string
  body: string
}

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (text: string) => void
  leadNombre?: string
  productoNombre?: string
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'default-1',
    nombre: 'Reposición de mercadería',
    body: 'Hola, {nombre}! ¿Cómo te va? Quería consultarte si necesitás reponer mercadería esta semana.',
  },
  {
    id: 'default-2',
    nombre: 'Oferta de producto',
    body: 'Hola {nombre}! Te comento que tenemos disponible {producto} a excelente precio. ¿Te interesa?',
  },
  {
    id: 'default-3',
    nombre: 'Recordatorio de pago',
    body: 'Hola {nombre}! Te recuerdo que tenés un saldo pendiente. ¿Cuándo podemos coordinar el pago?',
  },
]

function replaceVariables(
  text: string,
  leadNombre?: string,
  productoNombre?: string,
): string {
  return text
    .replace(/\{nombre\}/g, leadNombre ?? '{nombre}')
    .replace(/\{producto\}/g, productoNombre ?? '{producto}')
}

export default function QuickReplies({
  open,
  onClose,
  onSelect,
  leadNombre,
  productoNombre,
}: Props) {
  const { data: templates } = useQuery<Template[]>({
    queryKey: ['followup-templates'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/settings/followup/templates')
        if (!res.ok) return DEFAULT_TEMPLATES
        const json = await res.json() as { data?: Template[] } | Template[]
        const list = Array.isArray(json)
          ? json
          : (json as { data?: Template[] }).data ?? []
        return list.length > 0 ? list : DEFAULT_TEMPLATES
      } catch {
        return DEFAULT_TEMPLATES
      }
    },
    staleTime: 5 * 60_000,
    enabled: open,
  })

  const list = templates ?? DEFAULT_TEMPLATES

  function handleSelect(template: Template) {
    const replaced = replaceVariables(template.body, leadNombre, productoNombre)
    onSelect(replaced)
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Respuestas rápidas">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No hay respuestas guardadas
        </p>
      ) : (
        <div className="flex flex-col">
          {list.map((template) => {
            const preview = replaceVariables(template.body, leadNombre, productoNombre)
            return (
              <button
                key={template.id}
                onClick={() => handleSelect(template)}
                className="w-full text-left p-4 border-b border-border active:bg-accent transition-colors min-h-[56px]"
              >
                <p className="text-sm font-medium text-foreground">{template.nombre}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
              </button>
            )
          })}
        </div>
      )}
    </BottomSheet>
  )
}
