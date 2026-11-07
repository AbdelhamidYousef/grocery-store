CREATE TYPE "public"."pet_size" AS ENUM('xs', 's', 'm', 'l', 'xl');--> statement-breakpoint
CREATE TYPE "public"."pet_species" AS ENUM('dog', 'cat', 'bird', 'fish', 'small', 'reptile');--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"species" "pet_species" NOT NULL,
	"birthday" date,
	"approx_age_months" integer,
	"size" "pet_size",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pets_approx_age_check" CHECK ("pets"."approx_age_months" is null or "pets"."approx_age_months" >= 0)
);
--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pets_user_id_idx" ON "pets" USING btree ("user_id");
--> statement-breakpoint
CREATE TRIGGER pets_set_updated_at BEFORE UPDATE ON "pets" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
