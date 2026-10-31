-- citext: case-insensitive text, used for emails so "A@x.com" and "a@x.com" are one account.
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
-- Shared by every table that has `updated_at`. Done in the database (not in app code) so that
-- ad-hoc SQL, seeds and future services cannot forget to bump it. Each table attaches its own
-- trigger in the migration that creates it.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
