import type {
  users, leads, contacts, conversations, messages,
  pipelineStages, tags, activityLog, attachments, botConfig,
  followUpTemplates, followUpConfig, whatsappConfig,
} from '@/db/schema'

export type User = typeof users.$inferSelect
export type Lead = typeof leads.$inferSelect
export type Contact = typeof contacts.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type PipelineStage = typeof pipelineStages.$inferSelect
export type Tag = typeof tags.$inferSelect
export type ActivityLog = typeof activityLog.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type BotConfig = typeof botConfig.$inferSelect
export type FollowUpTemplate = typeof followUpTemplates.$inferSelect
export type FollowUpConfig = typeof followUpConfig.$inferSelect
export type WhatsappConfig = typeof whatsappConfig.$inferSelect

export type TemplateParameter = {
  position: number
  source: 'contact.name' | 'lead.productInterest' | 'lead.notes' | 'custom'
  value?: string
}

// Tipos compuestos para queries frecuentes
export type LeadWithContact = Lead & {
  contact: Contact
  stage: PipelineStage
  assignedUser: Pick<User, 'id' | 'name' | 'avatarColor'> | null
  tags: Tag[]
  lastMessage: Pick<Message, 'body' | 'contentType' | 'sentAt' | 'direction'> | null
  unreadCount: number
}

export type MessageWithAttachments = Message & {
  attachments: Attachment[]
  sender: Pick<User, 'id' | 'name' | 'avatarColor'> | null
}

export type ConversationWithMessages = Conversation & {
  messages: MessageWithAttachments[]
}
