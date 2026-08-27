-- Espera del bot antes de responder: junta los mensajes seguidos del contacto
-- y contesta una sola vez. Configurable en bot_config; el momento pendiente de
-- respuesta se guarda en el lead como red de seguridad del timer en memoria.
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "espera_respuesta_segundos" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "bot_responder_desde" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_bot_responder_desde_idx" ON "leads" USING btree ("bot_responder_desde");
