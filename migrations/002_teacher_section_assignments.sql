-- Migration: Section-Specific Teacher Assignments
-- Adds section_id to teacher_assignments table to allow assigning teachers to specific sections rather than whole classes
-- 1. Add section_id column (nullable, null means assigned to all sections of that class)
ALTER TABLE teacher_assignments
ADD COLUMN IF NOT EXISTS section_id TEXT REFERENCES sections(id) ON DELETE CASCADE;
-- 2. Drop the old unique constraint (class_subject_id, teacher_id)
-- Note: the actual constraint name might vary depending on how PostgreSQL generated it if not explicitly named.
-- Let's drop it correctly.
ALTER TABLE teacher_assignments DROP CONSTRAINT IF EXISTS teacher_assignments_class_subject_id_teacher_id_key;
-- 3. Add the new unique constraint that includes section_id
-- We use COALESCE so that if section_id is null, it's treated as a unique text to prevent multiple 'all sections' assignments for the same teacher and subject.
-- PostgreSQL UNIQUE constraint treats NULLs as distinct values, meaning (subject_1, teacher_1, NULL) and (subject_1, teacher_1, NULL) would both be allowed. 
-- To prevent this, we'll create a unique index.
DROP INDEX IF EXISTS idx_teacher_assignments_unique;
CREATE UNIQUE INDEX idx_teacher_assignments_unique ON teacher_assignments (
    class_subject_id,
    teacher_id,
    COALESCE(section_id, 'ALL_SECTIONS')
);
-- Note: We still want an index for section_id lookups
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_section ON teacher_assignments(section_id);
DO $$ BEGIN RAISE NOTICE 'Migration complete: section_id column added to teacher_assignments table.';
END $$;