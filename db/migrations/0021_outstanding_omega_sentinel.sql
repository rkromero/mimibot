ALTER TABLE "empresa_config" ADD COLUMN "cuit" text;--> statement-breakpoint
ALTER TABLE "empresa_config" ADD COLUMN "condicion_iva" text DEFAULT 'Responsable Inscripto';--> statement-breakpoint
ALTER TABLE "empresa_config" ADD COLUMN "punto_venta" text DEFAULT '0001';