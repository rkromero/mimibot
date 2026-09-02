'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn, relativeTime } from '@/lib/utils'
import { PROVINCIAS_AR } from '@/lib/validations/clientes'
import type { LeadWithContact } from '@/types/db'

type Props = { lead: LeadWithContact }

// Dirección completa y CUIT/DNI: se copian a la ficha del cliente al enviar la
// muestra o al convertir el lead (ver lib/clientes/conversion.ts).
type EditableField =
  | 'budget'
  | 'productInterest'
  | 'notes'
  | 'direccion'
  | 'localidad'
  | 'provincia'
  | 'codigoPostal'
  | 'cuit'

export default function LeadDetails({ lead }: Props) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<EditableField | null>(null)
  const [values, setValues] = useState({
    budget: lead.budget ?? '',
    productInterest: lead.productInterest ?? '',
    notes: lead.notes ?? '',
    direccion: lead.direccion ?? '',
    localidad: lead.localidad ?? '',
    provincia: lead.provincia ?? '',
    codigoPostal: lead.codigoPostal ?? '',
    cuit: lead.cuit ?? '',
  })

  // `valor` permite guardar en el mismo evento que cambia el estado (desplegable
  // de provincia), sin esperar al re-render.
  async function save(field: EditableField, valor?: string) {
    setEditing(null)
    const v = valor ?? values[field]
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: v || null }),
    })
    void queryClient.invalidateQueries({ queryKey: ['lead', lead.id] })
    void queryClient.invalidateQueries({ queryKey: ['leads'] })
  }

  return (
    <div className="py-2">
      <Section label="Contacto">
        <Row label="Teléfono" value={lead.contact.phone ?? '—'} />
        <Row label="Email" value={lead.contact.email ?? '—'} />
        <InlineEdit
          label="CUIT / DNI"
          value={values.cuit}
          isEditing={editing === 'cuit'}
          onEdit={() => setEditing('cuit')}
          onChange={(v) => setValues((p) => ({ ...p, cuit: v }))}
          onSave={() => save('cuit')}
          onCancel={() => setEditing(null)}
        />
        <Row label="Fuente" value={sourceLabel(lead.source)} />
        <Row label="Creado" value={relativeTime(lead.createdAt)} />
        {lead.lastContactedAt && (
          <Row label="Último contacto" value={relativeTime(lead.lastContactedAt)} />
        )}
      </Section>

      <Section label="Calificación">
        <InlineEdit
          label="Presupuesto"
          value={values.budget}
          isEditing={editing === 'budget'}
          onEdit={() => setEditing('budget')}
          onChange={(v) => setValues((p) => ({ ...p, budget: v }))}
          onSave={() => save('budget')}
          onCancel={() => setEditing(null)}
          prefix="$"
        />
        <InlineEdit
          label="Producto"
          value={values.productInterest}
          isEditing={editing === 'productInterest'}
          onEdit={() => setEditing('productInterest')}
          onChange={(v) => setValues((p) => ({ ...p, productInterest: v }))}
          onSave={() => save('productInterest')}
          onCancel={() => setEditing(null)}
        />
      </Section>

      <Section label="Dirección">
        <InlineEdit
          label="Calle y nº"
          value={values.direccion}
          isEditing={editing === 'direccion'}
          onEdit={() => setEditing('direccion')}
          onChange={(v) => setValues((p) => ({ ...p, direccion: v }))}
          onSave={() => save('direccion')}
          onCancel={() => setEditing(null)}
        />
        <InlineEdit
          label="Localidad"
          value={values.localidad}
          isEditing={editing === 'localidad'}
          onEdit={() => setEditing('localidad')}
          onChange={(v) => setValues((p) => ({ ...p, localidad: v }))}
          onSave={() => save('localidad')}
          onCancel={() => setEditing(null)}
        />
        <InlineSelect
          label="Provincia"
          value={values.provincia}
          options={PROVINCIAS_AR}
          placeholder="Seleccionar provincia"
          isEditing={editing === 'provincia'}
          onEdit={() => setEditing('provincia')}
          onChange={(v) => {
            setValues((p) => ({ ...p, provincia: v }))
            void save('provincia', v)
          }}
          onCancel={() => setEditing(null)}
        />
        <InlineEdit
          label="Código postal"
          value={values.codigoPostal}
          isEditing={editing === 'codigoPostal'}
          onEdit={() => setEditing('codigoPostal')}
          onChange={(v) => setValues((p) => ({ ...p, codigoPostal: v }))}
          onSave={() => save('codigoPostal')}
          onCancel={() => setEditing(null)}
        />
      </Section>

      <Section label="Notas">
        {editing === 'notes' ? (
          <div className="px-4 pb-3">
            <textarea
              autoFocus
              value={values.notes}
              onChange={(e) => setValues((p) => ({ ...p, notes: e.target.value }))}
              rows={4}
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded border resize-none',
                'border-border bg-background text-foreground',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            />
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={() => save('notes')}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Guardar
              </button>
              <button
                onClick={() => setEditing(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing('notes')}
            className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent/50 transition-colors"
          >
            {values.notes || (
              <span className="text-muted-foreground">Agregar nota...</span>
            )}
          </button>
        )}
      </Section>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="px-4 py-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between px-4 py-1.5 gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs text-foreground text-right truncate">{value}</span>
    </div>
  )
}

function InlineEdit({
  label, value, isEditing, onEdit, onChange, onSave, onCancel, prefix,
}: {
  label: string
  value: string
  isEditing: boolean
  onEdit: () => void
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  prefix?: string
}) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5 gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      {isEditing ? (
        <div className="flex items-center gap-1">
          {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave()
              if (e.key === 'Escape') onCancel()
            }}
            className={cn(
              'w-24 px-1.5 py-0.5 text-xs rounded border',
              'border-border bg-background text-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          />
        </div>
      ) : (
        <button
          onClick={onEdit}
          className="text-xs text-foreground hover:text-primary transition-colors text-right truncate max-w-[120px]"
        >
          {value ? `${prefix ?? ''}${value}` : <span className="text-muted-foreground">—</span>}
        </button>
      )}
    </div>
  )
}

// Misma fila que InlineEdit pero con desplegable: elegir una opción guarda al
// instante (no hay Enter). Escape o salir del campo cancela.
function InlineSelect({
  label, value, options, placeholder, isEditing, onEdit, onChange, onCancel,
}: {
  label: string
  value: string
  options: ReadonlyArray<string>
  placeholder: string
  isEditing: boolean
  onEdit: () => void
  onChange: (v: string) => void
  onCancel: () => void
}) {
  // Un valor guardado que no esté en la lista (importado o viejo) se ofrece igual
  const opciones = value && !options.includes(value) ? [value, ...options] : options

  return (
    <div className="flex items-center justify-between px-4 py-1.5 gap-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      {isEditing ? (
        <select
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCancel}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
          }}
          aria-label={label}
          className={cn(
            'w-36 px-1.5 py-0.5 text-xs rounded border',
            'border-border bg-background text-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        >
          <option value="">{placeholder}</option>
          {opciones.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <button
          onClick={onEdit}
          className="text-xs text-foreground hover:text-primary transition-colors text-right truncate max-w-[120px]"
        >
          {value || <span className="text-muted-foreground">—</span>}
        </button>
      )}
    </div>
  )
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    whatsapp: 'WhatsApp',
    landing: 'Landing page',
    manual: 'Manual',
  }
  return map[source] ?? source
}
