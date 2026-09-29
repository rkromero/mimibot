'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/shared/ToastProvider'
import { nombreLead } from '@/lib/clientes/nombre'
import { applyTemplateValues, resolveTemplateVariables, variablesParaChat, plantillaUsableEnChat } from '@/lib/whatsapp/variables'
import type { Candidato, FiltrosEnvio } from '@/lib/envios-masivos/candidatos'
import { MOTIVO_EXCLUSION_LABEL, minutosEstimados, type MotivoExclusion, type ResumenExclusiones } from '@/lib/envios-masivos/reglas'

type Stage = { id: string; name: string }
type Usuario = { id: string; name: string | null }
type Template = { name: string; language: string; status: string; bodyText: string; headerFormat: string | null; variables: unknown }

type Paso = 1 | 2 | 3

const inputClass = 'w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring'

/**
 * Asistente de nuevo envío en tres pasos: destinatarios (filtros + vista
 * previa con tildes), plantilla (con el texto resuelto para el primer lead)
 * y cuándo sale (ahora o programado). Antes de confirmar muestra cuántos
 * salen y cuántos quedan afuera por cada regla.
 */
export default function NuevoEnvioWizard({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const toast = useToast()
  const [paso, setPaso] = useState<Paso>(1)
  const [filtros, setFiltros] = useState<FiltrosEnvio>({})
  const [template, setTemplate] = useState<Template | null>(null)
  const [destildados, setDestildados] = useState<Set<string>>(new Set())
  const [nombre, setNombre] = useState('')
  const [cuando, setCuando] = useState<'ahora' | 'programado'>('ahora')
  const [programado, setProgramado] = useState('')
  const [enviando, setEnviando] = useState(false)

  const { data: stages = [] } = useQuery<Stage[]>({
    queryKey: ['stages'],
    queryFn: async () => ((await (await fetch('/api/stages')).json()) as { data: Stage[] }).data,
  })
  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['agents'],
    queryFn: async () => ((await (await fetch('/api/users?role=agent,vendedor,rtv,admin')).json()) as { data: Usuario[] }).data,
  })
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['wa-templates'],
    queryFn: async () => ((await (await fetch('/api/settings/whatsapp/templates')).json()) as { data: Template[] }).data,
  })
  const plantillasUsables = useMemo(
    () => templates.filter((t) => t.status === 'APPROVED' && (!t.headerFormat || t.headerFormat === 'TEXT') && plantillaUsableEnChat(variablesParaChat(t.bodyText, t.variables))),
    [templates],
  )

  // Vista previa del grupo: se recalcula al cambiar filtros o plantilla
  const { data: preview, isFetching: cargandoPreview } = useQuery<{ candidatos: Candidato[]; resumen: ResumenExclusiones }>({
    queryKey: ['envio-candidatos', filtros, template?.name ?? ''],
    queryFn: async () => {
      const res = await fetch('/api/admin/envios-masivos/candidatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filtros, templateName: template?.name ?? '__sin_plantilla__' }),
      })
      const json = await res.json() as { data?: { candidatos: Candidato[]; resumen: ResumenExclusiones }; error?: string }
      if (!res.ok || !json.data) throw new Error(json.error ?? 'No se pudo cargar la vista previa')
      return json.data
    },
    enabled: !!(filtros.stageId || filtros.assignedTo || filtros.source || filtros.creadoDesde || filtros.creadoHasta),
  })
  useEffect(() => setDestildados(new Set()), [filtros, template?.name])

  const candidatos = preview?.candidatos ?? []
  const elegibles = candidatos.filter((c) => !c.excluido && !destildados.has(c.leadId))
  const primero = elegibles[0] ?? null

  const previewTexto = useMemo(() => {
    if (!template) return ''
    const vars = variablesParaChat(template.bodyText, template.variables)
    const valores = resolveTemplateVariables(vars, {
      clienteNombre: primero?.nombre ?? 'Cliente',
      vendedorNombre: primero?.asignadoNombre ?? 'Teo',
      productoInteres: primero?.productInterest ?? 'tu producto',
    })
    return applyTemplateValues(template.bodyText, valores)
  }, [template, primero])

  function toggle(leadId: string) {
    setDestildados((prev) => {
      const n = new Set(prev)
      if (n.has(leadId)) n.delete(leadId)
      else n.add(leadId)
      return n
    })
  }

  async function confirmar() {
    if (!template) return
    setEnviando(true)
    try {
      const res = await fetch('/api/admin/envios-masivos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          templateName: template.name,
          templateLang: template.language,
          filtros,
          leadIds: elegibles.map((c) => c.leadId),
          programadoAt: cuando === 'programado' && programado ? new Date(programado).toISOString() : null,
        }),
      })
      const json = await res.json() as { data?: { total: number; inmediato: boolean }; error?: string }
      if (!res.ok || !json.data) throw new Error(json.error ?? 'No se pudo crear el envío')
      toast.success(json.data.inmediato ? `Envío en marcha: ${json.data.total} destinatarios` : 'Envío programado')
      onCreado()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el envío', 8000)
    } finally {
      setEnviando(false)
    }
  }

  const puedeSeguir1 = elegibles.length > 0
  const puedeSeguir2 = !!template
  const puedeConfirmar = nombre.trim().length > 0 && (cuando === 'ahora' || !!programado) && elegibles.length > 0 && !!template

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div
        className="bg-card w-full md:max-w-3xl md:rounded-xl rounded-t-2xl border border-border shadow-xl flex flex-col max-h-[95dvh] md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold">Nuevo envío masivo</h2>
            <p className="text-xs text-muted-foreground">
              Paso {paso} de 3 · {paso === 1 ? 'Destinatarios' : paso === 2 ? 'Plantilla' : 'Cuándo sale'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {paso === 1 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm space-y-1">
                  <span className="text-xs text-muted-foreground">Etapa</span>
                  <select className={inputClass} value={filtros.stageId ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, stageId: e.target.value || null }))}>
                    <option value="">Todas las etapas</option>
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-xs text-muted-foreground">Vendedor asignado</span>
                  <select className={inputClass} value={filtros.assignedTo ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, assignedTo: e.target.value || null }))}>
                    <option value="">Todos</option>
                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.id}</option>)}
                  </select>
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-xs text-muted-foreground">Fuente</span>
                  <select className={inputClass} value={filtros.source ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, source: (e.target.value || null) as FiltrosEnvio['source'] }))}>
                    <option value="">Todas</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="landing">Landing</option>
                    <option value="manual">Manual</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm space-y-1">
                    <span className="text-xs text-muted-foreground">Creados desde</span>
                    <input type="date" className={inputClass} value={filtros.creadoDesde ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, creadoDesde: e.target.value || null }))} />
                  </label>
                  <label className="text-sm space-y-1">
                    <span className="text-xs text-muted-foreground">hasta</span>
                    <input type="date" className={inputClass} value={filtros.creadoHasta ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, creadoHasta: e.target.value || null }))} />
                  </label>
                </div>
              </div>

              {!preview && !cargandoPreview && (
                <p className="text-sm text-muted-foreground">Elegí al menos un filtro para ver el grupo.</p>
              )}
              {cargandoPreview && <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Buscando leads…</p>}
              {preview && (
                <>
                  <ResumenChips resumen={preview.resumen} destildados={destildados.size} />
                  <div className="border border-border rounded-lg max-h-72 overflow-y-auto divide-y divide-border">
                    {candidatos.map((c) => {
                      const n = nombreLead(c.nombre, c.empresa)
                      const activo = !c.excluido && !destildados.has(c.leadId)
                      return (
                        <label key={c.leadId} className={cn('flex items-center gap-3 px-3 py-2 text-sm cursor-pointer', c.excluido && 'opacity-60 cursor-not-allowed')}>
                          <input type="checkbox" className="h-4 w-4 accent-primary" checked={activo} disabled={!!c.excluido} onChange={() => toggle(c.leadId)} />
                          <span className="flex-1 min-w-0">
                            <span className="font-medium truncate block">{n.principal}</span>
                            <span className="text-xs text-muted-foreground truncate block">
                              {n.secundario ? `${n.secundario} · ` : ''}{c.etapa ?? '—'}{c.asignadoNombre ? ` · ${c.asignadoNombre}` : ''}
                            </span>
                          </span>
                          {c.excluido && <span className="text-[11px] text-amber-700 dark:text-amber-300 shrink-0">{MOTIVO_EXCLUSION_LABEL[c.excluido]}</span>}
                        </label>
                      )
                    })}
                    {candidatos.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Ningún lead cumple esos filtros.</p>}
                  </div>
                  {!template && preview.resumen.elegibles > 0 && (
                    <p className="text-xs text-muted-foreground">La regla de &quot;ya recibió esta plantilla&quot; se aplica cuando elijas la plantilla en el paso 2.</p>
                  )}
                </>
              )}
            </>
          )}

          {paso === 2 && (
            <>
              <label className="text-sm space-y-1 block">
                <span className="text-xs text-muted-foreground">Plantilla aprobada (solo texto)</span>
                <select
                  className={inputClass}
                  value={template ? `${template.name}::${template.language}` : ''}
                  onChange={(e) => {
                    const [name, language] = e.target.value.split('::')
                    setTemplate(plantillasUsables.find((t) => t.name === name && t.language === language) ?? null)
                  }}
                >
                  <option value="">— Elegí una plantilla —</option>
                  {plantillasUsables.map((t) => <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>{t.name} ({t.language})</option>)}
                </select>
              </label>
              {plantillasUsables.length === 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-300 inline-flex items-center gap-2"><AlertTriangle size={14} /> No hay plantillas de texto aprobadas. Sincronizá en Ajustes → WhatsApp → Plantillas.</p>
              )}
              {template && (
                <div className="bg-muted/40 border border-border rounded-lg p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Así le llega a {primero ? nombreLead(primero.nombre, primero.empresa).principal : 'cada lead'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{previewTexto}</p>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Variables: nombre del contacto, vendedor asignado (si no tiene, quien manda el envío) y producto de interés.
                  </p>
                </div>
              )}
              {preview && <ResumenChips resumen={preview.resumen} destildados={destildados.size} />}
            </>
          )}

          {paso === 3 && (
            <>
              <label className="text-sm space-y-1 block">
                <span className="text-xs text-muted-foreground">Nombre del envío (para identificarlo en el chat y en el listado)</span>
                <input className={inputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Seguimiento propuestas septiembre" maxLength={120} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCuando('ahora')} className={cn('px-3 py-3 rounded-lg border text-sm font-medium', cuando === 'ahora' ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>Ahora</button>
                <button type="button" onClick={() => setCuando('programado')} className={cn('px-3 py-3 rounded-lg border text-sm font-medium', cuando === 'programado' ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>Programar</button>
              </div>
              {cuando === 'programado' && (
                <input type="datetime-local" className={inputClass} value={programado} onChange={(e) => setProgramado(e.target.value)} />
              )}
              <div className="bg-muted/40 border border-border rounded-lg p-4 text-sm space-y-1">
                <p><span className="font-semibold">{elegibles.length}</span> mensajes de la plantilla <span className="font-mono text-xs">{template?.name}</span>.</p>
                {preview && (
                  <p className="text-muted-foreground text-xs">
                    Quedan afuera: {preview.resumen.sin_whatsapp} sin WhatsApp, {preview.resumen.lead_cerrado} cerrados, {preview.resumen.plantilla_repetida} que ya la recibieron, {destildados.size} destildados.
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Salen de a uno, tarda unos {minutosEstimados(elegibles.length)} min. Solo entre las 8 y las 22 hs: si cae afuera, arranca a las 8. Cada plantilla se paga como mensaje iniciado por el negocio.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
          <button type="button" onClick={() => (paso === 1 ? onClose() : setPaso((p) => (p - 1) as Paso))} className="px-3 py-2 text-sm rounded-md border border-border hover:bg-accent">
            {paso === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          {paso < 3 ? (
            <button
              type="button"
              disabled={paso === 1 ? !puedeSeguir1 : !puedeSeguir2}
              onClick={() => setPaso((p) => (p + 1) as Paso)}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50"
            >
              Siguiente
            </button>
          ) : (
            <button
              type="button"
              disabled={!puedeConfirmar || enviando}
              onClick={() => void confirmar()}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-50 inline-flex items-center gap-2"
            >
              {enviando && <Loader2 size={14} className="animate-spin" />}
              {cuando === 'ahora' ? `Enviar a ${elegibles.length}` : `Programar para ${elegibles.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ResumenChips({ resumen, destildados }: { resumen: ResumenExclusiones; destildados: number }) {
  const items: Array<{ label: string; n: number; clase: string }> = [
    { label: 'van a recibir', n: Math.max(0, resumen.elegibles - destildados), clase: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    ...(['sin_whatsapp', 'lead_cerrado', 'plantilla_repetida'] as MotivoExclusion[])
      .filter((m) => resumen[m] > 0)
      .map((m) => ({ label: MOTIVO_EXCLUSION_LABEL[m].toLowerCase(), n: resumen[m], clase: 'bg-muted text-muted-foreground' })),
    ...(destildados > 0 ? [{ label: 'destildados', n: destildados, clase: 'bg-muted text-muted-foreground' }] : []),
  ]
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i.label} className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', i.clase)}>{i.n} {i.label}</span>
      ))}
    </div>
  )
}
