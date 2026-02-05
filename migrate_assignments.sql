-- Migration: Update assignments table to support sections
-- This script safely adds missing columns and updates constraints

-- Step 1: Add missing columns to assignments table if they don't exist
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS section_id TEXT,
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE;

-- Step 2: Create foreign key for section_id (if not already present)
-- First, check if constraint exists - if old assignments have no section, set a default
UPDATE assignments SET section_id = (SELECT id FROM sections LIMIT 1) WHERE section_id IS NULL;

-- Make section_id NOT NULL after populating
ALTER TABLE assignments
ALTER COLUMN section_id SET NOT NULL;

-- Add foreign key constraint
DO $$
BEGIN
  BEGIN
    ALTER TABLE assignments ADD CONSTRAINT fk_assignments_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN
    NULL;  -- Constraint already exists
  END;
END $$;

-- Step 3: Add missing indexes (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_assignments_section ON assignments(section_id);
CREATE INDEX IF NOT EXISTS idx_assignments_published ON assignments(is_published);

-- Step 4: Verify migration
SELECT 
  'Assignments table' AS table_name,
  COUNT(*) AS total_records,
  COUNT(CASE WHEN is_published THEN 1 END) AS published_count,
  COUNT(DISTINCT section_id) AS unique_sections
FROM assignments;

RAISE NOTICE 'Migration complete: Assignments table updated successfully';
