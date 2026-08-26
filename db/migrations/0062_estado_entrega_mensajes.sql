-- Tildes de enviado / entregado / leído en los mensajes salientes.
-- El webhook de Meta manda `statuses` (sent, delivered, read, failed) por
-- wa_message_id; se guardan acá para mostrarlos en el chat.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "wa_status" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "wa_status_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "wa_error" text;
