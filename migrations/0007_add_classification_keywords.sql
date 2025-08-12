
-- Add classification keywords table for managing categories and keywords
CREATE TABLE IF NOT EXISTS classification_keywords (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    keywords JSONB NOT NULL,
    description TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(category, subcategory)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_classification_keywords_category ON classification_keywords(category);
CREATE INDEX IF NOT EXISTS idx_classification_keywords_active ON classification_keywords(is_active);
CREATE INDEX IF NOT EXISTS idx_classification_keywords_keywords ON classification_keywords USING gin(keywords);

-- Insert default keyword categories
INSERT INTO classification_keywords (category, subcategory, keywords, description, created_by) VALUES
('materials_supplies', 'construction', '["cement", "concrete", "steel", "lumber", "paint", "hardware", "supplies", "rebar", "brick", "tile"]', 'Construction materials and supplies', 'system'),
('materials_supplies', 'office', '["paper", "pens", "pencils", "folders", "binders", "staplers", "clips", "envelopes"]', 'Office supplies and materials', 'system'),
('equipment_tools', 'construction', '["tools", "machinery", "equipment", "drill", "saw", "hammer", "wrench", "ladder", "scaffolding"]', 'Construction equipment and tools', 'system'),
('equipment_tools', 'office', '["computer", "printer", "scanner", "phone", "monitor", "keyboard", "mouse", "software"]', 'Office equipment and technology', 'system'),
('services_labor', 'professional', '["consulting", "labor", "maintenance", "repair", "installation", "service", "training", "support"]', 'Professional services and labor', 'system'),
('services_labor', 'utilities', '["electricity", "water", "gas", "internet", "phone", "waste", "utilities", "heating", "cooling"]', 'Utility services', 'system'),
('food_beverages', 'general', '["coffee", "food", "catering", "lunch", "beverages", "meals", "restaurant", "snacks", "drinks"]', 'Food and beverage expenses', 'system'),
('transportation_logistics', 'general', '["fuel", "transport", "shipping", "delivery", "vehicle", "maintenance", "parking", "tolls"]', 'Transportation and logistics', 'system');
