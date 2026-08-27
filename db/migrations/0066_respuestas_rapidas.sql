-- Respuestas rápidas del chat: mensajes predefinidos con un comando (/atajo)
-- para insertarlos o enviarlos desde el inbox.
CREATE TABLE IF NOT EXISTS "respuestas_rapidas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "atajo" text NOT NULL,
  "titulo" text NOT NULL,
  "body" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "respuestas_rapidas_atajo_unique" UNIQUE("atajo")
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "respuestas_rapidas" ADD CONSTRAINT "respuestas_rapidas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
