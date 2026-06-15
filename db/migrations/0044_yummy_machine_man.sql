CREATE TABLE "marcas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"es_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario_marcas" (
	"usuario_id" uuid NOT NULL,
	"marca_id" uuid NOT NULL,
	CONSTRAINT "usuario_marcas_usuario_id_marca_id_pk" PRIMARY KEY("usuario_id","marca_id")
);
--> statement-breakpoint
ALTER TABLE "usuario_marcas" ADD CONSTRAINT "usuario_marcas_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_marcas" ADD CONSTRAINT "usuario_marcas_marca_id_marcas_id_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marcas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marcas_slug_idx" ON "marcas" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "usuario_marcas_usuario_idx" ON "usuario_marcas" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "usuario_marcas_marca_idx" ON "usuario_marcas" USING btree ("marca_id");--> statement-breakpoint
-- Marca por defecto "Mimi" (visible para todos en esta fase)
INSERT INTO "marcas" ("nombre", "slug", "es_default")
VALUES ('Mimi', 'mimi', true)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
-- Columna marca_id en productos: se agrega nullable, se backfillea a Mimi y luego se marca NOT NULL
ALTER TABLE "productos" ADD COLUMN "marca_id" uuid;--> statement-breakpoint
UPDATE "productos"
SET "marca_id" = (SELECT "id" FROM "marcas" WHERE "slug" = 'mimi')
WHERE "marca_id" IS NULL;--> statement-breakpoint
ALTER TABLE "productos" ALTER COLUMN "marca_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_marca_id_marcas_id_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marcas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "productos_marca_idx" ON "productos" USING btree ("marca_id");
