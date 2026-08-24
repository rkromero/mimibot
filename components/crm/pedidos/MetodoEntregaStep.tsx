'use client'

import { cn } from '@/lib/utils'
import {
  debeIngresarExpresoNuevo,
  type EntregaFormState,
  type ExpresoGuardado,
} from '@/lib/pedidos/metodo-entrega'

type Props = {
  form: EntregaFormState
  onChange: (next: EntregaFormState) => void
  /** Expreso guardado en la ficha del cliente, si ya recibió envíos */
  expresoGuardado: ExpresoGuardado
}

/**
 * Paso "Entrega": retiro en fábrica o envío por expreso (y cuál).
 * Se usa en el alta de pedidos de los agentes y en el modal de muestra del lead.
 */
export default function MetodoEntregaStep({ form, onChange, expresoGuardado }: Props) {
  const set = (patch: Partial<EntregaFormState>) => onChange({ ...form, ...patch })

  return (
    <div className="space-y-5">
      <p className="text-sm font-medium text-foreground">¿Cómo recibe el cliente la mercadería?</p>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => set({ metodoEntrega: 'retiro_fabrica' })}
          className={cn(
            'w-full p-4 rounded-xl border-2 text-left transition-colors',
            form.metodoEntrega === 'retiro_fabrica'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card',
          )}
        >
          <span className="font-semibold text-foreground">🏭 Retiro en fábrica</span>
          <p className="text-sm text-muted-foreground mt-0.5">El cliente retira el pedido</p>
        </button>

        <button
          type="button"
          onClick={() => set({ metodoEntrega: 'expreso', usarExpresoGuardado: null })}
          className={cn(
            'w-full p-4 rounded-xl border-2 text-left transition-colors',
            form.metodoEntrega === 'expreso'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card',
          )}
        >
          <span className="font-semibold text-foreground">📦 Envío por expreso</span>
          <p className="text-sm text-muted-foreground mt-0.5">Se despacha por un transporte al cliente</p>
        </button>
      </div>

      {form.metodoEntrega === 'expreso' && (
        <div className="space-y-4">
          {/* Cliente con expreso guardado */}
          {expresoGuardado ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                Este cliente ya recibió envíos por{' '}
                <span className="font-semibold">{expresoGuardado.nombre}</span>.{' '}
                ¿Despachar por el mismo?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => set({ usarExpresoGuardado: true })}
                  className={cn(
                    'flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors',
                    form.usarExpresoGuardado === true
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border bg-card text-foreground',
                  )}
                >
                  Sí, mismo expreso
                </button>
                <button
                  type="button"
                  onClick={() => set({ usarExpresoGuardado: false })}
                  className={cn(
                    'flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors',
                    form.usarExpresoGuardado === false
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border bg-card text-foreground',
                  )}
                >
                  No, cargar uno nuevo
                </button>
              </div>
            </div>
          ) : null}

          {/* Formulario de nuevo expreso */}
          {debeIngresarExpresoNuevo(form, expresoGuardado) && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Nombre del expreso
                </label>
                <input
                  type="text"
                  value={form.nuevoExpresoNombre}
                  onChange={e => set({ nuevoExpresoNombre: e.target.value })}
                  placeholder="Ej: Andreani, OCA, Correo Argentino..."
                  className="w-full px-3 py-2.5 text-[16px] rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Dirección del expreso (dónde despachar)
                </label>
                <input
                  type="text"
                  value={form.nuevoExpresoDireccion}
                  onChange={e => set({ nuevoExpresoDireccion: e.target.value })}
                  placeholder="Dirección del transporte para despacho"
                  className="w-full px-3 py-2.5 text-[16px] rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
