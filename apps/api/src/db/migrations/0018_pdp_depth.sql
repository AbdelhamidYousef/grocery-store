CREATE TYPE "public"."life_stage" AS ENUM('puppy', 'adult', 'senior', 'any');--> statement-breakpoint
CREATE TYPE "public"."relation_kind" AS ENUM('bought_together', 'related');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('simple', 'bundle');--> statement-breakpoint
CREATE TABLE "bundle_items" (
	"bundle_variant_id" uuid NOT NULL,
	"component_variant_id" uuid NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "bundle_items_bundle_variant_id_component_variant_id_pk" PRIMARY KEY("bundle_variant_id","component_variant_id"),
	CONSTRAINT "bundle_items_qty_check" CHECK ("bundle_items"."qty" >= 1 and "bundle_items"."qty" <= 20),
	CONSTRAINT "bundle_items_self_check" CHECK ("bundle_items"."bundle_variant_id" <> "bundle_items"."component_variant_id")
);
--> statement-breakpoint
CREATE TABLE "feeding_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"pet_weight_g_min" integer NOT NULL,
	"pet_weight_g_max" integer NOT NULL,
	"daily_g" integer NOT NULL,
	"life_stage" "life_stage" DEFAULT 'any' NOT NULL,
	CONSTRAINT "feeding_rows_band_check" CHECK ("feeding_rows"."pet_weight_g_min" >= 0 and "feeding_rows"."pet_weight_g_max" > "feeding_rows"."pet_weight_g_min"),
	CONSTRAINT "feeding_rows_daily_check" CHECK ("feeding_rows"."daily_g" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_relations" (
	"product_id" uuid NOT NULL,
	"related_id" uuid NOT NULL,
	"kind" "relation_kind" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_relations_product_id_related_id_kind_pk" PRIMARY KEY("product_id","related_id","kind"),
	CONSTRAINT "product_relations_self_check" CHECK ("product_relations"."product_id" <> "product_relations"."related_id")
);
--> statement-breakpoint
CREATE TABLE "product_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_constituents" (
	"variant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value_bp" integer NOT NULL,
	CONSTRAINT "variant_constituents_variant_id_key_pk" PRIMARY KEY("variant_id","key"),
	CONSTRAINT "variant_constituents_key_check" CHECK ("variant_constituents"."key" in ('protein', 'fat', 'fibre', 'ash', 'moisture', 'kcal')),
	CONSTRAINT "variant_constituents_value_check" CHECK ("variant_constituents"."value_bp" >= 0 and "variant_constituents"."value_bp" <= case when "variant_constituents"."key" = 'kcal' then 9000 else 10000 end)
);
--> statement-breakpoint
CREATE TABLE "size_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"rows" jsonb NOT NULL,
	"howto_md" text DEFAULT '' NOT NULL,
	"tip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "size_guides_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "kind" "product_kind" DEFAULT 'simple' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "delivery_note" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "size_guide_id" uuid;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_bundle_variant_id_product_variants_id_fk" FOREIGN KEY ("bundle_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_items" ADD CONSTRAINT "bundle_items_component_variant_id_product_variants_id_fk" FOREIGN KEY ("component_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeding_rows" ADD CONSTRAINT "feeding_rows_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_faqs" ADD CONSTRAINT "product_faqs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_related_id_products_id_fk" FOREIGN KEY ("related_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_specs" ADD CONSTRAINT "product_specs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_constituents" ADD CONSTRAINT "variant_constituents_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bundle_items_component_idx" ON "bundle_items" USING btree ("component_variant_id");--> statement-breakpoint
CREATE INDEX "feeding_rows_product_idx" ON "feeding_rows" USING btree ("product_id","life_stage","pet_weight_g_min");--> statement-breakpoint
CREATE INDEX "product_faqs_product_idx" ON "product_faqs" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "product_relations_related_idx" ON "product_relations" USING btree ("related_id");--> statement-breakpoint
CREATE INDEX "product_specs_product_idx" ON "product_specs" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_specs_label_idx" ON "product_specs" USING btree ("product_id","label");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_size_guide_id_size_guides_id_fk" FOREIGN KEY ("size_guide_id") REFERENCES "public"."size_guides"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER product_faqs_set_updated_at BEFORE UPDATE ON "product_faqs" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER size_guides_set_updated_at BEFORE UPDATE ON "size_guides" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- A kit is made of plain products only: the bundle side must belong to a bundle product and the
-- component side to a simple one, so a bundle can never contain a bundle (stock and price maths
-- stay one level deep). The admin service checks first for a friendly message; this is the backstop.
CREATE FUNCTION bundle_items_check_kinds() RETURNS trigger AS $$
DECLARE
  bundle_kind product_kind;
  component_kind product_kind;
BEGIN
  SELECT p.kind INTO bundle_kind FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = NEW.bundle_variant_id;
  SELECT p.kind INTO component_kind FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = NEW.component_variant_id;
  IF bundle_kind IS DISTINCT FROM 'bundle' THEN
    RAISE EXCEPTION 'bundle_items: variant % does not belong to a bundle product', NEW.bundle_variant_id USING ERRCODE = '23514';
  END IF;
  IF component_kind IS DISTINCT FROM 'simple' THEN
    RAISE EXCEPTION 'bundle_items: a bundle cannot contain another bundle (variant %)', NEW.component_variant_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER bundle_items_check_kinds BEFORE INSERT OR UPDATE ON "bundle_items" FOR EACH ROW EXECUTE FUNCTION bundle_items_check_kinds();
