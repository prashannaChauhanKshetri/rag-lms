-- 004_quiz_manual_grading.sql
-- Adds manual grading and publication workflow fields for quiz submissions.

ALTER TABLE quiz_submissions
    ADD COLUMN IF NOT EXISTS question_scores JSONB,
    ADD COLUMN IF NOT EXISTS manual_total_score REAL,
    ADD COLUMN IF NOT EXISTS feedback TEXT,
    ADD COLUMN IF NOT EXISTS grading_status TEXT DEFAULT 'draft_review' CHECK (grading_status IN ('draft_review', 'reviewed', 'published')),
    ADD COLUMN IF NOT EXISTS graded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS is_result_published BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_status
ON quiz_submissions(quiz_id, grading_status);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_publish_state
ON quiz_submissions(quiz_id, is_result_published);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_graded_by
ON quiz_submissions(graded_by);
