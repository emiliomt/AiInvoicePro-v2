
-- Add headless field for Chrome browser configuration
ALTER TABLE "invoice_importer_configs" 
ADD COLUMN IF NOT EXISTS "headless" boolean DEFAULT true;
