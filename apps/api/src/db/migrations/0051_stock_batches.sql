CREATE TABLE "order_item_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"short_dated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "order_item_batches_quantity_check" CHECK ("order_item_batches"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"best_before" date,
	"quantity" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_batches_quantity_check" CHECK ("stock_batches"."quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shelf_life_days" integer;--> statement-breakpoint
ALTER TABLE "order_item_batches" ADD CONSTRAINT "order_item_batches_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_batches" ADD CONSTRAINT "order_item_batches_batch_id_stock_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."stock_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_inventory_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."inventory"("store_id","variant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_item_batches_item_idx" ON "order_item_batches" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "order_item_batches_batch_idx" ON "order_item_batches" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "stock_batches_store_variant_best_before_idx" ON "stock_batches" USING btree ("store_id","variant_id","best_before");--> statement-breakpoint
-- Backfill (hand-written): shelf life from the catalogue attributes (0 or missing = not food), then
-- one batch per stock row holding all of its units, so the sum invariant holds from the start. The
-- best-before date is today + shelf life (a fresh delivery); non-food does not expire.
UPDATE "products" SET "shelf_life_days" = ("attributes"->>'shelfLifeDays')::int
WHERE ("attributes"->>'shelfLifeDays') IS NOT NULL AND ("attributes"->>'shelfLifeDays')::int > 0;--> statement-breakpoint
INSERT INTO "stock_batches" ("store_id", "variant_id", "best_before", "quantity")
SELECT i."store_id", i."variant_id",
  CASE WHEN p."shelf_life_days" IS NULL THEN NULL ELSE current_date + p."shelf_life_days" END,
  i."quantity"
FROM "inventory" i
JOIN "product_variants" v ON v."id" = i."variant_id"
JOIN "products" p ON p."id" = v."product_id"
WHERE i."quantity" > 0;
