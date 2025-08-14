
-- Add method column to line_item_classifications table

-- First, create the classification_method enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE classification_method AS ENUM ('keyword-matching', 'ai', 'manual-override', 'keyword', 'fuzzy', 'context', 'learned', 'manual');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add the method column to the line_item_classifications table
ALTER TABLE "line_item_classifications" 
ADD COLUMN IF NOT EXISTS "method" classification_method DEFAULT 'keyword-matching';

-- Update existing records to have a default method value
UPDATE "line_item_classifications" 
SET "method" = 'keyword-matching' 
WHERE "method" IS NULL;

-- Make the method column NOT NULL after updating existing records
ALTER TABLE "line_item_classifications" 
ALTER COLUMN "method" SET NOT NULL;

-- Also add other missing columns that are in the schema but might not be in the database
ALTER TABLE "line_item_classifications" 
ADD COLUMN IF NOT EXISTS "subcategory" varchar(255),
ADD COLUMN IF NOT EXISTS "matched_keywords" text[],
ADD COLUMN IF NOT EXISTS "reasoning" text,
ADD COLUMN IF NOT EXISTS "vendor_context" text,
ADD COLUMN IF NOT EXISTS "is_user_verified" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "original_text" text;

-- Update the old matched_keyword column data to the new matched_keywords array if needed
UPDATE "line_item_classifications" 
SET "matched_keywords" = ARRAY[matched_keyword]
WHERE "matched_keyword" IS NOT NULL AND ("matched_keywords" IS NULL OR array_length("matched_keywords", 1) IS NULL);
