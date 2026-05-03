import { relations } from 'drizzle-orm'
import {
  users, accounts, sessions,
  leads, contacts, conversations, messages, attachments,
  pipelineStages, tags, leadTags, activityLog, botConfig,
} from './schema'

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  leads: many(leads, { relationName: 'assignedLeads' }),
  sentMessages: many(messages, { relationName: 'senderMessages' }),
  activityLogs: many(activityLog),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))


export const leadsRelations = relations(leads, ({ one, many }) => ({
  contact: one(contacts, { fields: [leads.contactId], references: [contacts.id] }),
  stage: one(pipelineStages, { fields: [leads.stageId], references: [pipelineStages.id] }),
  assignedUser: one(users, {
    fields: [leads.assignedTo],
    references: [users.id],
    relationName: 'assignedLeads',
  }),
  conversation: one(conversations, { fields: [leads.id], references: [conversations.leadId] }),
  tags: many(leadTags),
  activityLog: many(activityLog),
}))

export const contactsRelations = relations(contacts, ({ many }) => ({
  leads: many(leads),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  lead: one(leads, { fields: [conversations.leadId], references: [leads.id] }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
    relationName: 'senderMessages',
  }),
  attachments: many(attachments),
}))

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, { fields: [attachments.messageId], references: [messages.id] }),
}))

export const pipelineStagesRelations = relations(pipelineStages, ({ many }) => ({
  leads: many(leads),
}))

export const tagsRelations = relations(tags, ({ many }) => ({
  leadTags: many(leadTags),
}))

export const leadTagsRelations = relations(leadTags, ({ one }) => ({
  lead: one(leads, { fields: [leadTags.leadId], references: [leads.id] }),
  tag: one(tags, { fields: [leadTags.tagId], references: [tags.id] }),
}))

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  lead: one(leads, { fields: [activityLog.leadId], references: [leads.id] }),
  user: one(users, { fields: [activityLog.userId], references: [users.id] }),
}))
