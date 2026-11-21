CREATE TABLE "slot_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_holds_cart_id_unique" UNIQUE("cart_id")
);
--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "express" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_kind" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "slot_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_slot_id_delivery_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."delivery_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slot_holds_slot_expires_idx" ON "slot_holds" USING btree ("slot_id","expires_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_slot_id_delivery_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."delivery_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_slot_id_idx" ON "orders" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "orders_store_kind_created_idx" ON "orders" USING btree ("dark_store_id","delivery_kind","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_kind_check" CHECK ("orders"."delivery_kind" is null or "orders"."delivery_kind" in ('slot', 'express'));--> statement-breakpoint
-- Quick delivery fees (hand-written): a slot fee and an express fee; the parcel method stays,
-- switched off, so orders that snapshot it keep resolving.
INSERT INTO "shipping_methods" ("code", "name", "base_cents", "per_kg_cents", "free_over_cents", "eta_days_min", "eta_days_max", "is_active")
VALUES ('slot', 'Delivery in your slot', 299, 0, 4900, 0, 0, true)
ON CONFLICT ("code") DO UPDATE SET "name" = excluded."name", "base_cents" = excluded."base_cents", "per_kg_cents" = excluded."per_kg_cents", "free_over_cents" = excluded."free_over_cents", "is_active" = true;--> statement-breakpoint
INSERT INTO "shipping_methods" ("code", "name", "base_cents", "per_kg_cents", "free_over_cents", "eta_days_min", "eta_days_max", "is_active")
VALUES ('express', 'Express delivery (30 minutes)', 499, 0, NULL, 0, 0, true)
ON CONFLICT ("code") DO UPDATE SET "name" = excluded."name", "base_cents" = excluded."base_cents", "per_kg_cents" = excluded."per_kg_cents", "free_over_cents" = excluded."free_over_cents", "eta_days_min" = 0, "eta_days_max" = 0, "is_active" = true;--> statement-breakpoint
UPDATE "shipping_methods" SET "is_active" = false WHERE "code" = 'standard';
