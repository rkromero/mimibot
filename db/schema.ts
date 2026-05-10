import {
  pgTable, pgEnum, text, timestamp, boolean, integer,
  decimal, uuid, jsonb, primaryKey, index, uniqueIndex,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['admin', 'agent'])
export const leadSourceEnum = pgEnum('lead_source', ['whatsapp', 'landing', 'manual'])
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound'])
export const senderTypeEnum = pgEnum('sender_type', ['contact', 'bot', 'agent', 'system'])
export const contentTypeEnum = pgEnum('content_type', [
  'text', 'image', 'audio', 'video', 'document', 'template', 'internal_note',
])
export const activityActionEnum = pgEnum('activity_action', [
  'stage_changed', 'assigned', 'unassigned', 'note_added',
  'bot_handoff', 'bot_enabled', 'bot_disabled',
  'lead_created', 'tag_added', 'tag_removed',
  'follow_up_scheduled', 'follow_up_sent', 'follow_up_cancelled',
])
export const followUpStatusEnum = pgEnum('follow_up_status', ['pending', 'sent', 'cancelled', 'failed'])
export const followUpScenarioEnum = pgEnum('follow_up_scenario', ['no_response', 'stalling', 'manual'])

// ─── Auth.js (tablas requeridas por el adapter de Drizzle) ────────────────────

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  passwordHash: text('password_hash'),
  role: userRoleEnum('role').notNull().default('agent'),
  isOnline: boolean('is_online').notNull().default(false),
  lastSeenAt: timestamp('last_seen_at', { mode: 'date' }),
  avatarColor: text('avatar_color').notNull().default('#1d4ed8'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

// Columnas con los nombres exactos que espera el adapter de Auth.js v5
export const accounts = pgTable('accounts', {
  userId: uuid('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (t) => [
  primaryKey({ columns: [t.provider, t.providerAccountId] }),
])

// sessionToken debe ser primaryKey para el adapter de Auth.js
export const sessions = pgTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: uuid('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.identifier, t.token] }),
])

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export const pipelineStages = pgTable('pipeline_stages', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  position: integer('position').notNull(),
  color: text('color').notNull().default('#6b7280'),
  isTerminal: boolean('is_terminal').notNull().default(false),
  isWon: boolean('is_won').notNull().default(false),
  isDeletable: boolean('is_deletable').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('pipeline_stages_position_idx').on(t.position),
])

// ─── Contactos ────────────────────────────────────────────────────────────────

export const contacts = pgTable('contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),    // E.164, nullable (landing sin teléfono)
  email: text('email'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('contacts_phone_idx').on(t.phone),
])

// ─── Leads ────────────────────────────────────────────────────────────────────

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id),
  stageId: uuid('stage_id').notNull().references(() => pipelineStages.id),
  assignedTo: uuid('assigned_to').references(() => users.id),
  source: leadSourceEnum('source').notNull().default('manual'),
  budget: decimal('budget', { precision: 12, scale: 2 }),
  productInterest: text('product_interest'),
  notes: text('notes'),
  customFields: jsonb('custom_fields').notNull().default('{}'),
  botEnabled: boolean('bot_enabled').notNull().default(true),
  botQualified: boolean('bot_qualified').notNull().default(false),
  botTurnCount: integer('bot_turn_count').notNull().default(0),
  isOpen: boolean('is_open').notNull().default(true),
  lastContactedAt: timestamp('last_contacted_at', { mode: 'date' }),
  nextFollowUpAt: timestamp('next_follow_up_at', { mode: 'date' }),
  followUpCount: integer('follow_up_count').notNull().default(0),
  followUpStatus: followUpStatusEnum('follow_up_status'),
  followUpReason: text('follow_up_reason'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
}, (t) => [
  index('leads_stage_assigned_idx').on(t.stageId, t.assignedTo),
  index('leads_assigned_to_idx').on(t.assignedTo),
  index('leads_contact_idx').on(t.contactId),
  index('leads_open_stage_idx').on(t.isOpen, t.stageId),
  index('leads_follow_up_idx').on(t.nextFollowUpAt, t.followUpStatus),
])

// ─── Tags ─────────────────────────────────────────────────────────────────────

export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('#6b7280'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const leadTags = pgTable('lead_tags', {
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.leadId, t.tagId] }),
  index('lead_tags_tag_idx').on(t.tagId),
])

// ─── Conversaciones (una por lead) ────────────────────────────────────────────

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id').notNull().references(() => leads.id).unique(),
  waPhoneNumberId: text('wa_phone_number_id'),
  waContactPhone: text('wa_contact_phone'),
  lastMessageAt: timestamp('last_message_at', { mode: 'date' }),
  unreadCount: integer('unread_count').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('conversations_last_message_idx').on(t.lastMessageAt),
])

// ─── Mensajes ─────────────────────────────────────────────────────────────────

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
  waMessageId: text('wa_message_id'),
  direction: messageDirectionEnum('direction').notNull(),
  senderType: senderTypeEnum('sender_type').notNull(),
  senderId: uuid('sender_id').references(() => users.id),
  contentType: contentTypeEnum('content_type').notNull().default('text'),
  body: text('body'),
  isRead: boolean('is_read').notNull().default(false),
  sentAt: timestamp('sent_at', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('messages_conv_sent_idx').on(t.conversationId, t.sentAt),
  uniqueIndex('messages_wa_message_idx').on(t.waMessageId),
  index('messages_unread_idx').on(t.conversationId, t.isRead),
])

// ─── Adjuntos ─────────────────────────────────────────────────────────────────

export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').notNull().references(() => messages.id),
  waMediaId: text('wa_media_id'),
  r2Key: text('r2_key').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size'),
  originalFilename: text('original_filename'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('attachments_message_idx').on(t.messageId),
])

// ─── Follow-up templates ──────────────────────────────────────────────────────

export const followUpTemplates = pgTable('follow_up_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  templateName: text('template_name').notNull(),
  language: text('language').notNull().default('es'),
  scenario: followUpScenarioEnum('scenario').notNull().default('no_response'),
  bodyPreview: text('body_preview').notNull().default(''),
  parameters: jsonb('parameters').notNull().default('[]'),
  isActive: boolean('is_active').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

// ─── Configuración de seguimiento (singleton) ─────────────────────────────────

export const followUpConfig = pgTable('follow_up_config', {
  id: integer('id').primaryKey().default(1),
  isEnabled: boolean('is_enabled').notNull().default(true),
  noResponseHours: integer('no_response_hours').notNull().default(24),
  stallingDelayMinutes: integer('stalling_delay_minutes').notNull().default(60),
  maxFollowUps: integer('max_follow_ups').notNull().default(3),
  retryHours: jsonb('retry_hours').notNull().default('[1, 22, 72]'),
  stallingPhrases: text('stalling_phrases').array().notNull().default([]),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

// ─── Configuración del bot (singleton) ────────────────────────────────────────

export const botConfig = pgTable('bot_config', {
  id: integer('id').primaryKey().default(1),
  systemPrompt: text('system_prompt').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  qualificationQuestions: jsonb('qualification_questions').notNull().default('[]'),
  maxTurns: integer('max_turns').notNull().default(6),
  handoffPhrases: text('handoff_phrases').array().notNull().default([]),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

// ─── CRM: Enums ───────────────────────────────────────────────────────────────

export const origenClienteEnum = pgEnum('origen_cliente', ['manual', 'convertido_de_lead'])
export const estadoPedidoEnum = pgEnum('estado_pedido', ['pendiente', 'confirmado', 'entregado', 'cancelado'])
export const estadoPagoPedidoEnum = pgEnum('estado_pago_pedido', ['impago', 'parcial', 'pagado'])
export const tipoMovimientoCCEnum = pgEnum('tipo_movimiento_cc', ['debito', 'credito'])
export const actividadTipoEnum = pgEnum('actividad_tipo', ['visita', 'llamada', 'email', 'nota', 'tarea'])
export const actividadEstadoEnum = pgEnum('actividad_estado', ['pendiente', 'completada', 'cancelada'])
export const tipoDocumentoEnum = pgEnum('tipo_documento', ['remito', 'proforma'])

// ─── CRM: Clientes ────────────────────────────────────────────────────────────

export const clientes = pgTable('clientes', {
  id: uuid('id').defaultRandom().primaryKey(),
  nombre: text('nombre').notNull(),
  apellido: text('apellido').notNull(),
  email: text('email'),
  telefono: text('telefono'),
  direccion: text('direccion'),
  cuit: text('cuit'),
  origen: origenClienteEnum('origen').notNull().default('manual'),
  leadId: uuid('lead_id').references(() => leads.id),
  asignadoA: uuid('asignado_a').references(() => users.id),
  creadoPor: uuid('creado_por').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
}, (t) => [
  index('clientes_asignado_idx').on(t.asignadoA),
  index('clientes_email_idx').on(t.email),
  index('clientes_cuit_idx').on(t.cuit),
  index('clientes_lead_idx').on(t.leadId),
])

// ─── CRM: Productos ───────────────────────────────────────────────────────────

export const productos = pgTable('productos', {
  id: uuid('id').defaultRandom().primaryKey(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  precio: decimal('precio', { precision: 12, scale: 2 }).notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoPor: uuid('creado_por').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
}, (t) => [
  index('productos_activo_idx').on(t.activo),
])

// ─── CRM: Pedidos ─────────────────────────────────────────────────────────────

export const pedidos = pgTable('pedidos', {
  id: uuid('id').defaultRandom().primaryKey(),
  clienteId: uuid('cliente_id').notNull().references(() => clientes.id),
  vendedorId: uuid('vendedor_id').notNull().references(() => users.id),
  fecha: timestamp('fecha', { mode: 'date' }).notNull().defaultNow(),
  estado: estadoPedidoEnum('estado').notNull().default('pendiente'),
  total: decimal('total', { precision: 12, scale: 2 }).notNull().default('0'),
  montoPagado: decimal('monto_pagado', { precision: 12, scale: 2 }).notNull().default('0'),
  saldoPendiente: decimal('saldo_pendiente', { precision: 12, scale: 2 }).notNull().default('0'),
  estadoPago: estadoPagoPedidoEnum('estado_pago').notNull().default('impago'),
  observaciones: text('observaciones'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
}, (t) => [
  index('pedidos_cliente_idx').on(t.clienteId),
  index('pedidos_vendedor_idx').on(t.vendedorId),
  index('pedidos_estado_pago_idx').on(t.clienteId, t.estadoPago),
  index('pedidos_fecha_idx').on(t.fecha),
])

export const pedidoItems = pgTable('pedido_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  pedidoId: uuid('pedido_id').notNull().references(() => pedidos.id, { onDelete: 'cascade' }),
  productoId: uuid('producto_id').notNull().references(() => productos.id),
  cantidad: integer('cantidad').notNull(),
  precioUnitario: decimal('precio_unitario', { precision: 12, scale: 2 }).notNull(),
  subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
}, (t) => [
  index('pedido_items_pedido_idx').on(t.pedidoId),
])

// ─── CRM: Cuenta Corriente ────────────────────────────────────────────────────

export const movimientosCC = pgTable('movimientos_cc', {
  id: uuid('id').defaultRandom().primaryKey(),
  clienteId: uuid('cliente_id').notNull().references(() => clientes.id),
  tipo: tipoMovimientoCCEnum('tipo').notNull(),
  monto: decimal('monto', { precision: 12, scale: 2 }).notNull(),
  pedidoId: uuid('pedido_id').references(() => pedidos.id),
  fecha: timestamp('fecha', { mode: 'date' }).notNull().defaultNow(),
  descripcion: text('descripcion'),
  registradoPor: uuid('registrado_por').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
}, (t) => [
  index('movimientos_cc_cliente_idx').on(t.clienteId, t.fecha),
  index('movimientos_cc_pedido_idx').on(t.pedidoId),
])

export const aplicacionesPago = pgTable('aplicaciones_pago', {
  id: uuid('id').defaultRandom().primaryKey(),
  movimientoCreditoId: uuid('movimiento_credito_id').notNull().references(() => movimientosCC.id),
  pedidoId: uuid('pedido_id').notNull().references(() => pedidos.id),
  montoAplicado: decimal('monto_aplicado', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
}, (t) => [
  index('aplicaciones_pago_credito_idx').on(t.movimientoCreditoId),
  index('aplicaciones_pago_pedido_idx').on(t.pedidoId),
])

// ─── CRM: Actividades de cliente ──────────────────────────────────────────────

export const actividadesCliente = pgTable('actividades_cliente', {
  id: uuid('id').defaultRandom().primaryKey(),
  clienteId: uuid('cliente_id').notNull().references(() => clientes.id, { onDelete: 'cascade' }),
  tipo: actividadTipoEnum('tipo').notNull().default('tarea'),
  titulo: text('titulo').notNull(),
  notas: text('notas'),
  estado: actividadEstadoEnum('estado').notNull().default('pendiente'),
  fechaProgramada: timestamp('fecha_programada', { mode: 'date' }),
  fechaCompletada: timestamp('fecha_completada', { mode: 'date' }),
  asignadoA: uuid('asignado_a').references(() => users.id),
  creadoPor: uuid('creado_por').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('actividades_cliente_cliente_idx').on(t.clienteId, t.estado),
  index('actividades_cliente_asignado_idx').on(t.asignadoA),
  index('actividades_cliente_fecha_idx').on(t.fechaProgramada),
])

// ─── CRM: Documentos (remitos / proformas) ────────────────────────────────────

export const documentCounters = pgTable('document_counters', {
  tipo: tipoDocumentoEnum('tipo').primaryKey(),
  lastNumber: integer('last_number').notNull().default(0),
})

export const documentosEmitidos = pgTable('documentos_emitidos', {
  id: uuid('id').defaultRandom().primaryKey(),
  tipo: tipoDocumentoEnum('tipo').notNull(),
  numero: integer('numero').notNull(),
  pedidoId: uuid('pedido_id').notNull().references(() => pedidos.id),
  emitidoPor: uuid('emitido_por').notNull().references(() => users.id),
  emitidoAt: timestamp('emitido_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('documentos_emitidos_tipo_numero_idx').on(t.tipo, t.numero),
  index('documentos_emitidos_pedido_idx').on(t.pedidoId),
])

export const empresaConfig = pgTable('empresa_config', {
  id: integer('id').primaryKey().default(1),
  nombre: text('nombre').notNull().default(''),
  direccion: text('direccion'),
  telefono: text('telefono'),
  email: text('email'),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

// ─── Log de actividad ─────────────────────────────────────────────────────────

export const activityLog = pgTable('activity_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  leadId: uuid('lead_id').notNull().references(() => leads.id),
  userId: uuid('user_id').references(() => users.id),
  action: activityActionEnum('action').notNull(),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('activity_log_lead_created_idx').on(t.leadId, t.createdAt),
])
