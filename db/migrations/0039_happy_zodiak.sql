CREATE TABLE "rendicion_validaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repartidor_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"efectivo_esperado" numeric(12, 2) NOT NULL,
	"efectivo_recibido" numeric(12, 2) NOT NULL,
	"diferencia" numeric(12, 2) NOT NULL,
	"validado_por" uuid NOT NULL,
	"validado_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rendicion_validaciones" ADD CONSTRAINT "rendicion_validaciones_repartidor_id_users_id_fk" FOREIGN KEY ("repartidor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendicion_validaciones" ADD CONSTRAINT "rendicion_validaciones_validado_por_users_id_fk" FOREIGN KEY ("validado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rendicion_validaciones_repartidor_fecha_idx" ON "rendicion_validaciones" USING btree ("repartidor_id","fecha");--> statement-breakpoint
CREATE INDEX "rendicion_validaciones_fecha_idx" ON "rendicion_validaciones" USING btree ("fecha");