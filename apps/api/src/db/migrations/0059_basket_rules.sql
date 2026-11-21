ALTER TABLE "orders" DROP CONSTRAINT "orders_total_check";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_amounts_check";--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "bags" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "bag_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_check" CHECK ("orders"."total_cents" = "orders"."subtotal_cents" + "orders"."shipping_cents" + "orders"."tax_cents" + "orders"."donation_cents" + "orders"."deposit_cents" + "orders"."bag_fee_cents" - "orders"."discount_cents");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_check" CHECK ("orders"."subtotal_cents" >= 0 AND "orders"."shipping_cents" >= 0 AND "orders"."discount_cents" >= 0 AND "orders"."tax_cents" >= 0 AND "orders"."donation_cents" >= 0 AND "orders"."deposit_cents" >= 0 AND "orders"."bag_fee_cents" >= 0 AND "orders"."total_cents" >= 0);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_deposit_check" CHECK ("product_variants"."deposit_cents" >= 0);
-- Backfill: the seeded drinks that carried the `deposit` flag in their attributes (returnable PET
-- bottles) get the 0.25 EUR deposit. Orders keep their stored totals (the new order columns default
-- to 0, so every old order still satisfies the total check).
UPDATE "product_variants" SET "deposit_cents" = 25
WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "attributes"->>'deposit' = 'true');
