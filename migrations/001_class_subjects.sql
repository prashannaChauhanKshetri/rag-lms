-- Migration: Class-Subject-Teacher Data Model Redesign
-- This migration creates the new many-to-many relationship tables
-- and removes the old 1:1 foreign keys from classes and sections.
-- ============================================
-- STEP 1: Create new tables FIRST
-- ============================================
CREATE TABLE IF NOT EXISTS class_subjects (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, chatbot_id)
);
CREATE INDEX IF NOT EXISTS idx_class_subjects_class ON class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_chatbot ON class_subjects(chatbot_id);
CREATE TABLE IF NOT EXISTS teacher_assignments (
    id TEXT PRIMARY KEY,
    class_subject_id TEXT NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
    teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_subject_id, teacher_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_cs ON teacher_assignments(class_subject_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher ON teacher_assignments(teacher_id);
-- ============================================
-- STEP 2: Migrate existing data into new tables
-- (Preserve existing class→chatbot and class→teacher relationships)
-- ============================================
-- Migrate class subjects (class → chatbot)
INSERT INTO class_subjects (id, class_id, chatbot_id, created_at)
SELECT 'cs-' || id,
    id,
    chatbot_id,
    created_at
FROM classes
WHERE chatbot_id IS NOT NULL ON CONFLICT (class_id, chatbot_id) DO NOTHING;
-- Migrate teacher assignments (teacher → class_subject)
INSERT INTO teacher_assignments (id, class_subject_id, teacher_id, created_at)
SELECT 'ta-' || c.id,
    'cs-' || c.id,
    c.teacher_id,
    c.created_at
FROM classes c
WHERE c.teacher_id IS NOT NULL
    AND c.chatbot_id IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM class_subjects cs
        WHERE cs.id = 'cs-' || c.id
    ) ON CONFLICT (class_subject_id, teacher_id) DO NOTHING;
-- ============================================
-- STEP 3: Drop old columns from classes
-- ============================================
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_chatbot_id_name_teacher_id_institution_id_key;
ALTER TABLE classes DROP COLUMN IF EXISTS chatbot_id;
ALTER TABLE classes DROP COLUMN IF EXISTS teacher_id;
-- ============================================
-- STEP 4: Drop old columns from sections
-- ============================================
ALTER TABLE sections DROP COLUMN IF EXISTS chatbot_id;
ALTER TABLE sections DROP COLUMN IF EXISTS teacher_id;
-- ============================================
-- DONE
-- ============================================
DO $$ BEGIN RAISE NOTICE 'Migration complete: class_subjects and teacher_assignments tables created.';
RAISE NOTICE 'Old chatbot_id and teacher_id columns removed from classes and sections.';
END $$;