-- Orders held for a vet's okay carry on to packing; their history rows read "paid" instead of the removed status.
UPDATE "orders" SET "status" = 'processing' WHERE "status" = 'awaiting_vet_approval';--> statement-breakpoint
UPDATE "order_status_history" SET "from_status" = 'paid' WHERE "from_status" = 'awaiting_vet_approval';--> statement-breakpoint
UPDATE "order_status_history" SET "to_status" = 'paid' WHERE "to_status" = 'awaiting_vet_approval';--> statement-breakpoint
DROP TABLE "order_vet_details" CASCADE;--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "from_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "to_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending_payment'::text;--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "from_status" SET DATA TYPE "public"."order_status" USING "from_status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "to_status" SET DATA TYPE "public"."order_status" USING "to_status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending_payment'::"public"."order_status";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "requires_vet_approval";--> statement-breakpoint
DROP TYPE "public"."vet_decision";