-- Add pricing columns to domains table (missing from initial migration)
ALTER TABLE domains ADD COLUMN quick_sale_price integer NOT NULL DEFAULT 0;
ALTER TABLE domains ADD COLUMN target_price integer NOT NULL DEFAULT 0;
ALTER TABLE domains ADD COLUMN aspirational_price integer NOT NULL DEFAULT 0;
