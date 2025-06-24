
-- Migration to add new fields to purchase_orders table
ALTER TABLE purchase_orders 
ADD COLUMN original_order_number VARCHAR(100),
ADD COLUMN buyer_name VARCHAR(255),
ADD COLUMN buyer_address TEXT,
ADD COLUMN vendor_address TEXT,
ADD COLUMN terms TEXT,
ADD COLUMN ocr_text TEXT,
ADD COLUMN file_name VARCHAR(255),
ADD COLUMN uploaded_by VARCHAR(255);

-- Update existing records to avoid null issues
UPDATE purchase_orders SET 
  original_order_number = '',
  buyer_name = '',
  buyer_address = '',
  vendor_address = '',
  terms = '',
  ocr_text = '',
  file_name = '',
  uploaded_by = 'system'
WHERE original_order_number IS NULL;
