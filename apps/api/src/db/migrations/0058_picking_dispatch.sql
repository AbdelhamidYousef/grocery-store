CREATE TYPE "public"."aisle_zone" AS ENUM('ambient', 'chilled', 'frozen');--> statement-breakpoint
CREATE TABLE "aisles" (
	"store_id" uuid NOT NULL,
	"subcategory_id" uuid NOT NULL,
	"aisle" integer NOT NULL,
	"zone" "aisle_zone" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aisles_store_subcategory_key" UNIQUE("store_id","subcategory_id"),
	CONSTRAINT "aisles_aisle_check" CHECK ("aisles"."aisle" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "packed_grams" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "packed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rider_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "aisles" ADD CONSTRAINT "aisles_store_id_dark_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."dark_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aisles" ADD CONSTRAINT "aisles_subcategory_id_categories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;