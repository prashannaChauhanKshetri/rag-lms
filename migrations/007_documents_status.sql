-- 007_documents_status.sql
-- Adds processing status tracking to documents so PDF ingestion can run in the
-- background instead of blocking the upload request.

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready'
        CHECK (status IN ('processing', 'ready', 'failed')),
    ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
