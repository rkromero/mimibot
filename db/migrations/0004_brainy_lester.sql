CREATE TYPE "public"."actividad_estado" AS ENUM('pendiente', 'completada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."actividad_tipo" AS ENUM('visita', 'llamada', 'email', 'nota', 'tarea');--> statement-breakpoint
CREATE TABLE "actividades_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"tipo" "actividad_tipo" DEFAULT 'tarea' NOT NULL,
	"titulo" text NOT NULL,
	"notas" text,
	"estado" "actividad_estado" DEFAULT 'pendiente' NOT NULL,
	"fecha_programada" timestamp,
	"fecha_completada" timestamp,
	"asignado_a" uuid,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actividades_cliente" ADD CONSTRAINT "actividades_cliente_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividades_cliente" ADD CONSTRAINT "actividades_cliente_asignado_a_users_id_fk" FOREIGN KEY ("asignado_a") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividades_cliente" ADD CONSTRAINT "actividades_cliente_creado_por_users_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actividades_cliente_cliente_idx" ON "actividades_cliente" USING btree ("cliente_id","estado");--> statement-breakpoint
CREATE INDEX "actividades_cliente_asignado_idx" ON "actividades_cliente" USING btree ("asignado_a");--> statement-breakpoint
CREATE INDEX "actividades_cliente_fecha_idx" ON "actividades_cliente" USING btree ("fecha_programada");