-- Bot: propuesta automática al calificar (switch) y gramaje por defecto
-- cuando la persona no lo especificó. Aditiva e idempotente.
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "propuesta_automatica" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "gramaje_default" integer DEFAULT 60 NOT NULL;
