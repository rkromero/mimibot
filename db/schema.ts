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
])

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
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('leads_stage_assigned_idx').on(t.stageId, t.assignedTo),
  index('leads_assigned_to_idx').on(t.assignedTo),
  index('leads_contact_idx').on(t.contactId),
  index('leads_open_stage_idx').on(t.isOpen, t.stageId),
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
