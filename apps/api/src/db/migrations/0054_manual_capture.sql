ALTER TYPE "public"."payment_status" ADD VALUE 'authorized' BEFORE 'succeeded';--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "price_per_kg_cents" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "weighed_grams" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "final_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "authorized_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "captured_cents" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "capture_method" text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_capture_check" CHECK ("orders"."captured_cents" is null or ("orders"."captured_cents" >= 0 and "orders"."authorized_cents" is not null and "orders"."captured_cents" <= "orders"."authorized_cents"));