ALTER TABLE "clientes" ADD COLUMN "geocode_status" text;--> statement-breakpoint
ALTER TABLE "empresa_config" ADD COLUMN "localidad" text;--> statement-breakpoint
ALTER TABLE "empresa_config" ADD COLUMN "provincia" text;--> statement-breakpoint
INSERT INTO "empresa_config" ("id", "nombre", "direccion", "localidad", "provincia")
VALUES (1, '', 'Jose Ignacio de la Rosa 6276', 'Ciudad Autónoma de Buenos Aires', 'CABA')
ON CONFLICT ("id") DO UPDATE
  SET "direccion" = EXCLUDED."direccion",
      "localidad" = EXCLUDED."localidad",
      "provincia" = EXCLUDED."provincia";
