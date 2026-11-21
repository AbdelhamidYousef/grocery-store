ALTER TABLE "product_variants" ADD COLUMN "sold_by_weight" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "price_per_kg_cents" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "nominal_grams" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_weight_check" CHECK (("product_variants"."sold_by_weight" and "product_variants"."price_per_kg_cents" is not null and "product_variants"."price_per_kg_cents" > 0 and "product_variants"."nominal_grams" is not null and "product_variants"."nominal_grams" > 0) or (not "product_variants"."sold_by_weight" and "product_variants"."price_per_kg_cents" is null and "product_variants"."nominal_grams" is null));--> statement-breakpoint
-- Backfill (hand-written): the catalogue flagged weighed products in `attributes`; their variants get
-- the price per kg implied by today's unit price and the net grams (price_cents is unchanged).
UPDATE "product_variants" v
SET "sold_by_weight" = true,
    "price_per_kg_cents" = round(v."price_cents" * 1000.0 / v."net_amount")::int,
    "nominal_grams" = v."net_amount"
FROM "products" p
WHERE p."id" = v."product_id" AND (p."attributes"->>'soldByWeight') = 'true'
  AND v."net_unit" = 'g' AND v."net_amount" > 0 AND v."price_cents" > 0;
