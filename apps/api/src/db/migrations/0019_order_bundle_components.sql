ALTER TABLE "order_items" ADD COLUMN "bundle_components" jsonb;
--> statement-breakpoint
-- Orders placed before this column existed: snapshot the kit's current parts (best effort).
UPDATE "order_items" oi SET "bundle_components" = (
  SELECT jsonb_agg(jsonb_build_object('variantId', bi.component_variant_id, 'qty', bi.qty))
  FROM "bundle_items" bi WHERE bi.bundle_variant_id = oi.variant_id
) WHERE oi.variant_id IN (SELECT bundle_variant_id FROM bundle_items);
