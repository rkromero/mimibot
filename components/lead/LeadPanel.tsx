'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Bot, Phone, ExternalLink, Mail, MapPin, CreditCard, ShoppingBag, Package, Zap, ArrowLeft, FlaskConical } from 'lucide-react'
import RespuestasRapidasPanel from '@/components/chat/RespuestasRapidasPanel'
import QuickReplies from '@/components/chat/QuickReplies'
import { usePanelRespuestasRapidas } from '@/lib/inbox/use-respuestas-rapidas'
import { emitirInsertarTexto } from '@/lib/inbox/composer-events'
import { useEsMobile } from '@/lib/ui/use-es-mobile'
import { cn } from '@/lib/utils'
import { formatFechaHoraAR } from '@/lib/dates'
import Link from 'next/link'
import Avatar from '@/components/shared/Avatar'
import LeadDetails from './LeadDetails'
import ActivityLogPanel from './ActivityLogPanel'
import ChatFeed from '@/components/chat/ChatFeed'
import ChatComposer from '@/components/chat/ChatComposer'
import CargarPedidoFab from '@/components/chat/CargarPedidoFab'
import { esRolReparto } from '@/lib/authz/roles'
import TagBadge from '@/components/shared/TagBadge'
import GradoBadge from '@/components/shared/GradoBadge'
import { labelMotivoPerdida } from '@/lib/leads/motivos-perdida'
import CotizadorLead, { PropuestasList } from './CotizadorLead'
import MuestraModal from './MuestraModal'
import AvisoMuestraButton from './AvisoMuestraLead'
import ResumenLeadChips from './ResumenLeadChips'
import BottomSheet from '@/components/shared/BottomSheet'
import EtapaLeadSelector from './EtapaLeadSelector'
import type { LeadWithContact, LeadTagRow, Tag } from '@/types/db'
import type { VariablesRespuesta } from '@/lib/inbox/respuestas-rapidas'
import { nombreLead } from '@/lib/clientes/nombre'
import type { Session } from 'next-auth'

// GET /api/leads/[id] devuelve tags como filas de lead_tags con el tag anidado
// (LeadTagRow[]); el shape plano (Tag[]) se contempla por compatibilidad.
type LeadWithConversation = Omit<LeadWithContact, 'tags'> & {
  tags: Tag[] | LeadTagRow[]
  conversation?: { id: string }
  /** Pedido de muestra CDA más reciente del lead (null si nunca se cargó) */
  muestraPedido?: MuestraPedidoResumen | null
}

type ClienteDetail = {
  id: string
  nombre: string
  apellido: string | null
  empresa: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  cuit: string | null
  pedidosSummary: {
    count: number
    total: string
    saldoPendiente: string
    ultimoPedidoFecha: string | null
  }
}

type PedidoItem = {
  id: string
  fecha: string
  total: string
  estado: string
  estadoPago: string
}

type Props = {
  /** Present for lead conversations (and for backwards-compat callers like KanbanBoard) */
  leadId?: string | null
  /** Present for client conversations */
  clienteId?: string | null
  /** Explicit conversation ID — preferred over lead.conversation.id when provided */
  conversationId?: string | null
  tipo?: 'cliente' | 'lead'
  /** Display name from inbox list (nombre de la persona) */
  nombre?: string | null
  /** Empresa / marca from inbox list (hasta que carguen el lead o el cliente) */
  empresa?: string | null
  contactPhone?: string | null
  onClose: () => void
  user: Session['user']
  mobileMode?: boolean
  /** When true, renders inline (no fixed overlay). Used by InboxView desktop. */
  embedded?: boolean
}

function fmt(value: string | number | null | undefined): string {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
}

function fmtFecha(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  pendiente_aprobacion: 'P. Aprobación',
  confirmado: 'Confirmado',
  listo_para_repartir: 'Listo',
  en_reparto: 'En reparto',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  pendiente_aprobacion: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  confirmado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  listo_para_repartir: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  en_reparto: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  entregado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const PAGO_LABEL: Record<string, string> = {
  impago: 'Impago',
  parcial: 'Parcial',
  pagado: 'Pagado',
}

const PAGO_COLOR: Record<string, string> = {
  impago: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  parcial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  pagado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

export default function LeadPanel({
  leadId,
  clienteId,
  conversationId,
  tipo,
  nombre,
  empresa: empresaInicial,
  contactPhone,
  onClose,
  user,
  mobileMode,
  embedded = false,
}: Props) {
  const queryClient = useQueryClient()
  const isClienteMode = tipo === 'cliente' || (!leadId && !!clienteId)

  const { data: lead, isLoading, isError } = useQuery<LeadWithConversation>({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}`)
      if (!res.ok) throw new Error('Error al cargar lead')
      const json = await res.json() as { data: LeadWithConversation }
      return json.data
    },
    enabled: !isClienteMode && !!leadId,
    retry: false,
  })

  const { data: cliente } = useQuery<ClienteDetail>({
    queryKey: ['cliente-detail', clienteId],
    queryFn: async () => {
      const res = await fetch(`/api/clientes/${clienteId}`)
      if (!res.ok) throw new Error('Error al cargar cliente')
      const json = await res.json() as { data: ClienteDetail }
      return json.data
    },
    enabled: isClienteMode && !!clienteId,
    retry: false,
  })

  const { data: pedidosData } = useQuery<{ data: PedidoItem[] }>({
    queryKey: ['cliente-pedidos', clienteId],
    queryFn: async () => {
      const res = await fetch(`/api/pedidos?clienteId=${clienteId}&limit=5&sortBy=fecha&sortDir=desc`)
      if (!res.ok) throw new Error('Error al cargar pedidos')
      return res.json() as Promise<{ data: PedidoItem[] }>
    },
    enabled: isClienteMode && !!clienteId,
    retry: false,
  })

  const effectiveConvId = conversationId ?? lead?.conversation?.id ?? null

  // Tags normalizados a Tag[] sin importar el shape (plano o anidado)
  const tagList: Tag[] = (lead?.tags ?? []).map((t) => ('tag' in t ? t.tag : t))

  // Datos con los que se completan {nombre}, {empresa} y {producto} en las respuestas rápidas
  const empresaActual = (isClienteMode ? cliente?.empresa : lead?.empresa) ?? empresaInicial ?? null
  const variablesRespuesta: VariablesRespuesta = isClienteMode
    ? { nombre: nombre ?? [cliente?.nombre, cliente?.apellido].filter(Boolean).join(' '), empresa: empresaActual }
    : { nombre: lead?.contact?.name ?? nombre, empresa: empresaActual, producto: lead?.productInterest }
  // Cabeceras: empresa como línea principal y la persona debajo (si hay empresa)
  const encabezado = nombreLead(variablesRespuesta.nombre ?? null, empresaActual)

  // Panel de respuestas rápidas al lado del chat (desktop); el botón ⚡ de la
  // cabecera "Conversación" lo abre y cierra.
  const [rrAbierto, toggleRr] = usePanelRespuestasRapidas()

  // En el celular, el panel flotante (kanban, ficha del cliente) usa el layout
  // mobile a pantalla completa en vez de las dos columnas de escritorio.
  const esMobile = useEsMobile()
  const [qrOpen, setQrOpen] = useState(false)

  // ── Muestra CDA ──────────────────────────────────────────────────────────────
  // Disponible para todos los leads, sin importar el tag de origen.
  // El botón abre el modal con el paso "Entrega" (retiro / expreso); el pedido
  // se crea desde el modal y acá solo guardamos el id para linkearlo.
  const [muestraPedidoId, setMuestraPedidoId] = useState<string | null>(null)
  const [muestraModalOpen, setMuestraModalOpen] = useState(false)
  // Celular: hoja inferior con las acciones del lead (ver ResumenLeadChips)
  const [accionesOpen, setAccionesOpen] = useState(false)

  useEffect(() => {
    setMuestraPedidoId(null)
    setMuestraModalOpen(false)
    setAccionesOpen(false)
  }, [leadId])

  // Abrir el panel marca el lead como visto (lo hace el GET): se invalidan
  // las listas del kanban para que el bubble "Nuevo" se apague al volver.
  const loadedLeadId = lead?.id ?? null
  useEffect(() => {
    if (!loadedLeadId) return
    void queryClient.invalidateQueries({ queryKey: ['leads-col'] })
    void queryClient.invalidateQueries({ queryKey: ['leads-list'] })
  }, [loadedLeadId, queryClient])

  async function toggleBot() {
    if (!lead || !leadId) return
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botEnabled: !lead.botEnabled }),
    })
    void queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
  }

  // ── Mobile mode ──────────────────────────────────────────────────────────────
  const modoMobile = mobileMode || (!embedded && esMobile === true)
  if (modoMobile) {
    let inner: ReactNode
    if (!isClienteMode && isLoading) {
      inner = (
        <div className="flex items-center justify-center w-full h-full text-sm text-muted-foreground">
          Cargando...
        </div>
      )
    } else if (!isClienteMode && (isError || !lead)) {
      inner = (
        <div className="flex flex-col items-center justify-center gap-3 w-full h-full text-sm text-muted-foreground">
          <p>No se pudo cargar el lead.</p>
          <button
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['inbox'] })
              onClose()
            }}
            className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent transition-colors"
          >
            Cerrar
          </button>
        </div>
      )
    } else {
      // El chat ocupa toda la pantalla. Lo que antes se apilaba arriba (muestra,
      // cotizar / llamada / recordar / último seguimiento, etapa, propuestas)
      // vive en la hoja "Acciones"; una línea de chips resume el estado.
      inner = (
        <div className="flex flex-col w-full h-full min-h-0">
          {!isClienteMode && leadId && lead && (
            <ResumenLeadChips leadId={leadId} lead={lead} onAbrir={() => setAccionesOpen(true)} />
          )}
          {muestraModalOpen && leadId && (
            <MuestraModal
              leadId={leadId}
              onClose={() => setMuestraModalOpen(false)}
              onCreated={(pedidoId) => { setMuestraPedidoId(pedidoId); setMuestraModalOpen(false) }}
            />
          )}
          {!isClienteMode && leadId && lead && (
            <BottomSheet open={accionesOpen} onClose={() => setAccionesOpen(false)} title="Acciones del lead">
              <div className="-mx-4 -mt-1">
                <CotizadorLead
                  leadId={leadId}
                  stage={lead.stage}
                  recordatorioAt={lead.recordatorioAt}
                  recordatorioNota={lead.recordatorioNota}
                  seguimiento={lead}
                  mobile
                />
                <MuestraCda
                  leadId={leadId}
                  aviso={lead}
                  muestraPedido={lead.muestraPedido}
                  pedidoId={muestraPedidoId}
                  onEnviar={() => { setAccionesOpen(false); setMuestraModalOpen(true) }}
                  mobile
                />
                <EtapaLeadSelector
                  leadId={leadId}
                  stage={lead.stage}
                  leadName={lead.contact?.name ?? nombre ?? null}
                  mobile
                />
                <PropuestasList leadId={leadId} mobile />
              </div>
            </BottomSheet>
          )}
          {effectiveConvId ? (
            <>
              <ChatConPedido leadId={isClienteMode ? null : leadId} clienteId={clienteId} user={user}>
                <ChatFeed conversationId={effectiveConvId} />
              </ChatConPedido>
              <ChatComposer conversationId={effectiveConvId} leadId={leadId ?? undefined} variables={variablesRespuesta} />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {isClienteMode
                  ? 'Este cliente no tiene conversación de WhatsApp.'
                  : 'Este lead no tiene conversación de WhatsApp.'}
              </p>
            </div>
          )}
        </div>
      )
    }

    // El inbox mobile ya pone su propia cabecera (InboxView); acá solo el contenido.
    if (mobileMode) return inner

    // Panel flotante en el celular (kanban, ficha del cliente): pantalla
    // completa por encima de la barra inferior, con cabecera para volver y ⚡.
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-background">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <button
            onClick={onClose}
            className="p-2 -ml-2 text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{encabezado.principal || '...'}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              {encabezado.secundario && <span className="truncate">{encabezado.secundario} ·</span>}
              {!isClienteMode && lead?.botEnabled ? (
                <>
                  <Bot size={11} />
                  Bot activo
                </>
              ) : (
                'WhatsApp'
              )}
            </p>
          </div>
          {effectiveConvId && (
            <button
              onClick={() => setQrOpen(true)}
              className="p-2 text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Respuestas rápidas"
              title="Respuestas rápidas"
            >
              <Zap size={18} />
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{inner}</div>
        <QuickReplies
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          onSelect={(text) => {
            if (effectiveConvId) emitirInsertarTexto({ conversationId: effectiveConvId, text })
            setQrOpen(false)
          }}
          variables={variablesRespuesta}
        />
      </div>
    )
  }

  // Panel flotante: hasta saber el ancho del viewport no se pinta nada, para
  // no mostrar un instante las dos columnas de escritorio en el celular.
  if (!embedded && esMobile === null) return null

  // ── Desktop mode ─────────────────────────────────────────────────────────────

  // Cliente mode: panel with full client data
  if (isClienteMode) {
    const displayName = cliente
      ? [cliente.nombre, cliente.apellido].filter(Boolean).join(' ')
      : (nombre ?? 'Cliente')
    const displayEmpresa = nombreLead(displayName, cliente?.empresa ?? empresaInicial)

    const saldo = Number(cliente?.pedidosSummary?.saldoPendiente ?? 0)
    const ultimosPedidos = pedidosData?.data?.slice(0, 5) ?? []

    const clienteInner = (
      <div className="flex w-full h-full overflow-hidden">
        {/* Columna izquierda: datos del cliente */}
        <div className="flex flex-col w-72 shrink-0 border-r border-border overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Avatar name={displayEmpresa.principal} color="#6b7280" size="md" />
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-foreground truncate">{displayEmpresa.principal}</span>
                {displayEmpresa.secundario && (
                  <span className="text-xs text-muted-foreground truncate">{displayEmpresa.secundario}</span>
                )}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors duration-100 shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          {/* Badge cliente */}
          <div className="px-4 pt-3 pb-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[11px] font-medium">
              Cliente
            </span>
          </div>

          {/* Datos de contacto */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Contacto</p>
            <div className="flex flex-col gap-1.5">
              <Row icon={<Phone size={12} />} value={cliente?.telefono ?? contactPhone} />
              <Row icon={<Mail size={12} />} value={cliente?.email} />
              <Row
                icon={<MapPin size={12} />}
                value={[cliente?.direccion, cliente?.localidad, cliente?.provincia].filter(Boolean).join(', ') || null}
              />
              <Row icon={<CreditCard size={12} />} label="CUIT" value={cliente?.cuit} />
            </div>
          </div>

          {/* Saldo */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Saldo pendiente</p>
            <span
              className={cn(
                'text-base font-semibold',
                saldo > 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground',
              )}
            >
              {fmt(saldo)}
            </span>
          </div>

          {/* Últimos pedidos */}
          <div className="px-4 py-3 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Últimos pedidos
            </p>
            {ultimosPedidos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin pedidos</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ultimosPedidos.map((p) => (
                  <Link
                    key={p.id}
                    href={`/crm/pedidos/${p.id}`}
                    className="flex flex-col gap-1 p-2 rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{fmtFecha(p.fecha)}</span>
                      <span className="text-xs font-medium text-foreground">{fmt(p.total)}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', ESTADO_COLOR[p.estado] ?? 'bg-zinc-100 text-zinc-600')}>
                        {ESTADO_LABEL[p.estado] ?? p.estado}
                      </span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', PAGO_COLOR[p.estadoPago] ?? 'bg-zinc-100 text-zinc-600')}>
                        {PAGO_LABEL[p.estadoPago] ?? p.estadoPago}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Footer: link ficha completa */}
          {clienteId && (
            <div className="px-4 py-3 border-t border-border shrink-0">
              <Link
                href={`/crm/clientes/${clienteId}`}
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink size={12} />
                Ver ficha completa
              </Link>
            </div>
          )}
        </div>

        {/* Columna derecha: chat + respuestas rápidas */}
        <div className="flex flex-1 min-w-0">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
              <ShoppingBag size={14} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Conversación</span>
              {effectiveConvId && <BotonRespuestasRapidas abierto={rrAbierto} onClick={toggleRr} />}
            </div>
            {effectiveConvId ? (
              <>
                <ChatConPedido leadId={null} clienteId={clienteId} user={user}>
                  <ChatFeed conversationId={effectiveConvId} />
                </ChatConPedido>
                <ChatComposer conversationId={effectiveConvId} variables={variablesRespuesta} />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">Sin conversación disponible.</p>
              </div>
            )}
          </div>
          {effectiveConvId && (
            <RespuestasRapidasPanel
              conversationId={effectiveConvId}
              variables={variablesRespuesta}
              abierto={rrAbierto}
              onToggle={toggleRr}
              className="hidden md:flex"
            />
          )}
        </div>
      </div>
    )

    if (embedded) {
      return (
        <div className="flex w-full h-full min-h-0 bg-background border-l border-border">
          {clienteInner}
        </div>
      )
    }
    return (
      <div className="fixed inset-y-0 right-0 flex z-40">
        <button className="fixed inset-0 bg-black/10 dark:bg-black/30" onClick={onClose} aria-label="Cerrar" />
        <div className={cn(
          'relative flex ml-auto max-w-full h-full bg-background border-l border-border shadow-md transition-[width] duration-150',
          // Más ancho con el panel de respuestas rápidas abierto, para no achicar el chat
          rrAbierto ? 'w-[1040px]' : 'w-[780px]',
        )}>
          {clienteInner}
        </div>
      </div>
    )
  }

  // Lead mode: original behavior
  const leadInner = isLoading ? (
    <div className="flex items-center justify-center w-full text-sm text-muted-foreground">
      Cargando...
    </div>
  ) : isError || !lead ? (
    <div className="flex flex-col items-center justify-center gap-3 w-full text-sm text-muted-foreground">
      <p>No se pudo cargar el lead (puede haber sido borrado).</p>
      <button
        onClick={() => {
          void queryClient.invalidateQueries({ queryKey: ['inbox'] })
          onClose()
        }}
        className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent transition-colors"
      >
        Cerrar
      </button>
    </div>
  ) : (
    <div className="flex w-full h-full overflow-hidden">
      {/* Columna izquierda: detalles del lead */}
      <div className="flex flex-col w-72 shrink-0 border-r border-border overflow-y-auto">
        <div className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={nombreLead(lead.contact.name, lead.empresa).principal} color="#6b7280" size="md" />
            <span className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">
                {nombreLead(lead.contact.name, lead.empresa).principal}
              </span>
              {nombreLead(lead.contact.name, lead.empresa).secundario && (
                <span className="text-xs text-muted-foreground truncate">
                  {nombreLead(lead.contact.name, lead.empresa).secundario}
                </span>
              )}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors duration-100 shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {(tagList.length > 0 || lead.botGrado) && (
          <div className="flex flex-wrap items-center gap-1 px-4 py-2 border-b border-border">
            <GradoBadge grado={lead.botGrado} score={lead.botScore} conTexto />
            {tagList.map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
          </div>
        )}

        {!lead.isOpen && lead.perdidoAt && (
          <div className="px-4 py-2 border-b border-border bg-rose-50 dark:bg-rose-950/20">
            <p className="text-xs text-rose-700 dark:text-rose-300">
              <span className="font-medium">Perdido:</span> {labelMotivoPerdida(lead.motivoPerdida)}
              {lead.motivoPerdidaDetalle ? ` — ${lead.motivoPerdidaDetalle}` : ''}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bot size={13} />
            <span>Bot IA</span>
          </div>
          <button
            onClick={toggleBot}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150',
              lead.botEnabled ? 'bg-primary' : 'bg-zinc-200 dark:bg-zinc-700',
            )}
          >
            <span
              className={cn(
                'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-150',
                lead.botEnabled ? 'translate-x-4' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <MuestraCda leadId={leadId!} aviso={lead} muestraPedido={lead.muestraPedido} pedidoId={muestraPedidoId} onEnviar={() => setMuestraModalOpen(true)} />
        {muestraModalOpen && leadId && (
          <MuestraModal
            leadId={leadId}
            onClose={() => setMuestraModalOpen(false)}
            onCreated={(pedidoId) => { setMuestraPedidoId(pedidoId); setMuestraModalOpen(false) }}
          />
        )}

        <CotizadorLead
          leadId={leadId!}
          stage={lead.stage}
          recordatorioAt={lead.recordatorioAt}
          recordatorioNota={lead.recordatorioNota}
          seguimiento={lead}
        />
        <EtapaLeadSelector leadId={leadId!} stage={lead.stage} leadName={lead.contact?.name ?? null} />
        <PropuestasList leadId={leadId!} />

        <div className="flex-1 overflow-y-auto">
          <LeadDetails lead={{ ...lead, tags: tagList }} />
          <ActivityLogPanel leadId={leadId!} />
        </div>
      </div>

      {/* Columna derecha: chat + respuestas rápidas */}
      <div className="flex flex-1 min-w-0">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
            <span className="text-sm font-medium text-foreground">Conversación</span>
            {lead.botEnabled && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Bot size={11} />
                Bot activo
              </span>
            )}
            {effectiveConvId && <BotonRespuestasRapidas abierto={rrAbierto} onClick={toggleRr} />}
          </div>

          {effectiveConvId ? (
            <>
              <ChatConPedido leadId={leadId} clienteId={clienteId} user={user}>
                <ChatFeed conversationId={effectiveConvId} />
              </ChatConPedido>
              <ChatComposer conversationId={effectiveConvId} leadId={leadId ?? undefined} variables={variablesRespuesta} />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Este lead no tiene conversación de WhatsApp.
              </p>
            </div>
          )}
        </div>
        {effectiveConvId && (
          <RespuestasRapidasPanel
            conversationId={effectiveConvId}
            variables={variablesRespuesta}
            abierto={rrAbierto}
            onToggle={toggleRr}
            className="hidden md:flex"
          />
        )}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="flex w-full h-full min-h-0 bg-background border-l border-border">
        {leadInner}
      </div>
    )
  }
  return (
    <div className="fixed inset-y-0 right-0 flex z-40">
      <button
        className="fixed inset-0 bg-black/10 dark:bg-black/30"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className={cn(
          'relative flex ml-auto max-w-full h-full bg-background border-l border-border shadow-md transition-[width] duration-150',
          // Más ancho con el panel de respuestas rápidas abierto, para no achicar el chat
          rrAbierto ? 'w-[1040px]' : 'w-[780px]',
        )}>
        {leadInner}
      </div>
    </div>
  )
}

/**
 * Envuelve el feed del chat y le superpone el botón flotante "Cargar pedido"
 * abajo a la derecha, justo encima del cuadro para escribir. Fábrica y
 * reparto no cargan pedidos: no lo ven.
 */
function ChatConPedido({
  leadId,
  clienteId,
  user,
  children,
}: {
  leadId?: string | null
  clienteId?: string | null
  user: Session['user']
  children: ReactNode
}) {
  const puedeCargar = user.role !== 'fabrica' && !esRolReparto(user.role)
  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      {children}
      {puedeCargar && (
        <CargarPedidoFab leadId={leadId} clienteId={clienteId} className="absolute bottom-3 right-3 z-10" />
      )}
    </div>
  )
}

/** Botón ⚡ de la cabecera del chat: abre/cierra el panel de respuestas rápidas. */
function BotonRespuestasRapidas({ abierto, onClick }: { abierto: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'ml-auto hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
        abierto
          ? 'bg-primary/10 text-primary hover:bg-primary/15'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent',
      )}
      title={abierto ? 'Ocultar respuestas rápidas' : 'Mostrar respuestas rápidas'}
      aria-pressed={abierto}
    >
      <Zap size={13} />
      Respuestas rápidas
    </button>
  )
}

/** Resumen del pedido de muestra CDA del lead (viene con GET /api/leads/[id]). */
type MuestraPedidoResumen = {
  id: string
  estado: string
  metodoEntrega: string | null
  expresoNombre: string | null
  entregadoAt: Date | string | null
  conFoto: boolean
}

/**
 * Bloque "Muestra CDA" del panel: estado del pedido de muestra a la izquierda
 * (pendiente → confirmado → en reparto → entregado), link al pedido y, según
 * el estado, el botón para cargarla o el aviso al cliente con la guía.
 */
function MuestraCda({
  leadId,
  aviso,
  muestraPedido,
  pedidoId,
  onEnviar,
  mobile,
}: {
  leadId: string
  /** Lead cargado: define si la muestra ya se entregó y si falta avisarle al cliente */
  aviso: { muestraEntregadaAt: Date | string | null; muestraAvisadaAt: Date | string | null } | null | undefined
  muestraPedido: MuestraPedidoResumen | null | undefined
  /** Pedido recién creado en esta sesión (hasta que el lead se refresque) */
  pedidoId: string | null
  onEnviar: () => void
  mobile?: boolean
}) {
  const pedido: MuestraPedidoResumen | null =
    muestraPedido ??
    (pedidoId
      ? { id: pedidoId, estado: 'pendiente_aprobacion', metodoEntrega: null, expresoNombre: null, entregadoAt: null, conFoto: false }
      : null)
  const activa = !!pedido && pedido.estado !== 'cancelado'
  const entregada = !!aviso?.muestraEntregadaAt || pedido?.estado === 'entregado'

  const botonEnviar = (
    <button
      onClick={onEnviar}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
        activa
          ? 'border border-border text-muted-foreground hover:bg-accent'
          : 'bg-primary text-primary-foreground hover:bg-primary/90',
        mobile && 'min-h-[44px] flex-1 justify-center text-sm',
      )}
    >
      <Package size={13} />
      {activa ? 'Otra muestra' : 'Enviar muestra CDA'}
    </button>
  )

  return (
    <div className={cn('px-4 py-2.5 border-b border-border flex flex-wrap items-center gap-2', mobile && 'shrink-0')}>
      {pedido && (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
            ESTADO_COLOR[pedido.estado] ?? 'bg-muted text-muted-foreground',
          )}
          title={
            pedido.estado === 'entregado' && pedido.entregadoAt
              ? `Muestra entregada el ${formatFechaHoraAR(pedido.entregadoAt)}${pedido.expresoNombre ? ` por ${pedido.expresoNombre}` : ''}`
              : pedido.metodoEntrega === 'expreso'
                ? `Muestra por expreso${pedido.expresoNombre ? ` (${pedido.expresoNombre})` : ''}`
                : pedido.metodoEntrega === 'retiro_fabrica'
                  ? 'Muestra para retirar en fábrica'
                  : 'Pedido de muestra CDA'
          }
        >
          <FlaskConical size={11} />
          Muestra: {ESTADO_LABEL[pedido.estado] ?? pedido.estado}
        </span>
      )}
      {pedido && (
        <Link
          href={`/crm/pedidos/${pedido.id}`}
          className={cn('inline-flex items-center gap-1 text-xs text-primary hover:underline', mobile && 'min-h-[44px]')}
        >
          <ExternalLink size={12} />
          Ver pedido
        </Link>
      )}
      {/* Entregada: el paso que sigue es avisarle al cliente con la guía */}
      {entregada && aviso && <AvisoMuestraButton leadId={leadId} aviso={aviso} mobile={mobile} />}
      {/* Sin muestra activa: cargarla. Entregada o cancelada: se puede mandar otra. */}
      {(!activa || pedido?.estado === 'entregado') && botonEnviar}
    </div>
  )
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label?: string
  value: string | null | undefined
}) {
  return (
    <div className="flex items-start gap-1.5 text-xs text-foreground">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 break-words">
        {label && <span className="text-muted-foreground mr-1">{label}:</span>}
        {value ?? <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  )
}
