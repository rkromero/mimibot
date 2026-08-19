CREATE TYPE "public"."estado_propuesta" AS ENUM('borrador', 'pendiente_aprobacion', 'aprobada', 'enviada', 'aceptada', 'rechazada', 'vencida');--> statement-breakpoint
CREATE TYPE "public"."packaging_propuesta" AS ENUM('cristal', 'personalizado');--> statement-breakpoint
ALTER TYPE "public"."tipo_documento" ADD VALUE 'propuesta';--> statement-breakpoint
CREATE TABLE "propuestas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer NOT NULL,
	"lead_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"gramaje" integer NOT NULL,
	"packaging" "packaging_propuesta" NOT NULL,
	"descuento_manual_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"resultado" jsonb NOT NULL,
	"estado" "estado_propuesta" DEFAULT 'borrador' NOT NULL,
	"vigente_hasta" date NOT NULL,
	"creado_por" uuid NOT NULL,
	"aprobado_por" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_creado_por_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propuestas" ADD CONSTRAINT "propuestas_aprobado_por_users_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "propuestas_numero_idx" ON "propuestas" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "propuestas_lead_idx" ON "propuestas" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "propuestas_estado_idx" ON "propuestas" USING btree ("estado");