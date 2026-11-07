CREATE TABLE "menu_promos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet" "pet_species",
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"image_url" text NOT NULL,
	"image_alt" text NOT NULL,
	"link" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "menu_promos_pet_idx" ON "menu_promos" USING btree ("pet","active","sort_order");
--> statement-breakpoint
CREATE TRIGGER menu_promos_set_updated_at BEFORE UPDATE ON "menu_promos" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
