CREATE TABLE "delivery_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_slots_store_starts_key" UNIQUE("store_id","starts_at"),
	CONSTRAINT "delivery_slots_capacity_check" CHECK ("delivery_slots"."capacity" > 0),
	CONSTRAINT "delivery_slots_window_check" CHECK ("delivery_slots"."ends_at" > "delivery_slots"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "dark_stores" ADD COLUMN "opens_at" time DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "dark_stores" ADD COLUMN "closes_at" time DEFAULT '22:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "dark_stores" ADD COLUMN "slot_capacity" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "dark_stores" ADD COLUMN "express_riders" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_slots" ADD CONSTRAINT "delivery_slots_store_id_dark_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."dark_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER delivery_slots_set_updated_at BEFORE UPDATE ON "delivery_slots" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
