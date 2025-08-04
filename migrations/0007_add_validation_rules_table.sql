
CREATE TABLE IF NOT EXISTS "validation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"field_name" text NOT NULL,
	"rule_type" text NOT NULL,
	"rule_value" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"error_message" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
