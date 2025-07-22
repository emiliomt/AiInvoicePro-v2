
-- Allow null connection_id for manual invoice importer configurations
ALTER TABLE "invoice_importer_configs" 
ALTER COLUMN "connection_id" DROP NOT NULL;

-- Add Python RPA specific fields that were missing
ALTER TABLE "invoice_importer_configs" 
ADD COLUMN IF NOT EXISTS "erp_url" varchar(500),
ADD COLUMN IF NOT EXISTS "erp_username" varchar(255),
ADD COLUMN IF NOT EXISTS "erp_password" text;
