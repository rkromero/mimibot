CREATE TYPE "public"."tipo_documento" AS ENUM('remito', 'proforma');--> statement-breakpoint
CREATE TABLE "document_counters" (
	"tipo" "tipo_documento" PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentos_emitidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_documento" NOT NULL,
	"numero" integer NOT NULL,
	"pedido_id" uuid NOT NULL,
	"emitido_por" uuid NOT NULL,
	"emitido_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresa_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"direccion" text,
	"telefono" text,
	"email" text,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aplicaciones_pago" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "movimientos_cc" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "documentos_emitidos" ADD CONSTRAINT "documentos_emitidos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_emitidos" ADD CONSTRAINT "documentos_emitidos_emitido_por_users_id_fk" FOREIGN KEY ("emitido_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_config" ADD CONSTRAINT "empresa_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_emitidos_tipo_numero_idx" ON "documentos_emitidos" USING btree ("tipo","numero");--> statement-breakpoint
CREATE INDEX "documentos_emitidos_pedido_idx" ON "documentos_emitidos" USING btree ("pedido_id");