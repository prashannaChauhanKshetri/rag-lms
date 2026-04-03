-- Migration 005: Add section_type column to document_chunks
-- This enables section-aware retrieval (exercises vs theory vs code)

ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS section_type TEXT DEFAULT 'content';

CREATE INDEX IF NOT EXISTS idx_chunks_section_type
ON document_chunks(chatbot_id, section_type);

-- Backfill: tag existing chunks that have section_type in JSONB metadata
UPDATE document_chunks
SET section_type = metadata->>'section_type'
WHERE metadata->>'section_type' IS NOT NULL
  AND section_type = 'content';
