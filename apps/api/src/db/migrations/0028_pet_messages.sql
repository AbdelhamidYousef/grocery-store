CREATE TABLE "pet_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period_key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_messages_pet_kind_period_unique" UNIQUE("pet_id","kind","period_key")
);
--> statement-breakpoint
ALTER TABLE "pet_messages" ADD CONSTRAINT "pet_messages_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;