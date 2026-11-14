ALTER TABLE "products" DROP CONSTRAINT "products_size_guide_id_size_guides_id_fk";
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "size_guide_id";--> statement-breakpoint
DROP TABLE "size_guides";
