ALTER TABLE "order_items" ADD COLUMN "pick_status" "pick_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "picked_qty" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "substitutes_item_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "swap_status" "swap_status";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "refund_intent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "refunded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_substitutes_item_id_order_items_id_fk" FOREIGN KEY ("substitutes_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_substitutes_item_idx" ON "order_items" USING btree ("substitutes_item_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_swap_check" CHECK (("order_items"."substitutes_item_id" is null) = ("order_items"."swap_status" is null));--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_picked_check" CHECK ("order_items"."picked_qty" is null or ("order_items"."picked_qty" >= 0 and "order_items"."picked_qty" <= "order_items"."quantity"));--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_refunded_check" CHECK ("order_items"."refunded_cents" >= 0 and "order_items"."refunded_cents" <= greatest("order_items"."line_total_cents", coalesce("order_items"."final_cents", 0)));