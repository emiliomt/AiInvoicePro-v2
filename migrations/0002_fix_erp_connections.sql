
-- Add missing columns to erp_connections table if they don't exist
ALTER TABLE erp_connections 
ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS last_used TIMESTAMP;

-- Update existing records to have a default name if empty
UPDATE erp_connections SET name = 'ERP Connection ' || id WHERE name = '' OR name IS NULL;
