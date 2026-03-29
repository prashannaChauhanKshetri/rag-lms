-- Migration: switch full-text search from 'english' to 'simple'
-- Run this ONCE on the live database, then re-ingest all PDFs.

-- 1. Recreate GIN index with 'simple' (language-agnostic)
DROP INDEX IF EXISTS idx_chunks_text_search;
CREATE INDEX idx_chunks_text_search ON document_chunks USING gin (to_tsvector('simple', text));

-- 2. Recreate hybrid_search function with 'simple' text config
CREATE OR REPLACE FUNCTION hybrid_search(
        p_chatbot_id TEXT,
        p_query_text TEXT,
        p_query_embedding vector(384),
        p_limit INTEGER DEFAULT 15,
        p_bm25_weight REAL DEFAULT 0.3,
        p_vector_weight REAL DEFAULT 0.7
    ) RETURNS TABLE (
        id INTEGER,
        text TEXT,
        original_text TEXT,
        source TEXT,
        page INTEGER,
        heading TEXT,
        is_feedback BOOLEAN,
        hybrid_score REAL,
        bm25_score REAL,
        vector_similarity REAL
    ) AS $$ BEGIN RETURN QUERY WITH vector_results AS (
        SELECT dc.id,
            dc.text,
            dc.original_text,
            dc.source,
            dc.page,
            dc.heading,
            dc.is_feedback,
            (1 - (dc.embedding <=> p_query_embedding)) AS similarity
        FROM document_chunks dc
        WHERE dc.chatbot_id = p_chatbot_id
        ORDER BY dc.embedding <=> p_query_embedding
        LIMIT p_limit * 2
    ), text_results AS (
        SELECT dc.id,
            dc.text,
            dc.original_text,
            dc.source,
            dc.page,
            dc.heading,
            dc.is_feedback,
            ts_rank(
                to_tsvector('simple', dc.text),
                plainto_tsquery('simple', p_query_text)
            ) AS rank
        FROM document_chunks dc
        WHERE dc.chatbot_id = p_chatbot_id
            AND to_tsvector('simple', dc.text) @@ plainto_tsquery('simple', p_query_text)
        ORDER BY rank DESC
        LIMIT p_limit * 2
    ), combined AS (
        SELECT DISTINCT ON (dc.id) dc.id,
            dc.text,
            dc.original_text,
            dc.source,
            dc.page,
            dc.heading,
            dc.is_feedback,
            COALESCE(vr.similarity, 0) AS vec_sim,
            COALESCE(tr.rank, 0) AS txt_rank
        FROM document_chunks dc
            LEFT JOIN vector_results vr ON dc.id = vr.id
            LEFT JOIN text_results tr ON dc.id = tr.id
        WHERE dc.chatbot_id = p_chatbot_id
            AND (vr.id IS NOT NULL OR tr.id IS NOT NULL)
    ),
    normalized AS (
        SELECT *,
            CASE WHEN MAX(vec_sim) OVER () > 0 THEN vec_sim / MAX(vec_sim) OVER () ELSE 0 END AS norm_vec,
            CASE WHEN MAX(txt_rank) OVER () > 0 THEN txt_rank / MAX(txt_rank) OVER () ELSE 0 END AS norm_txt
        FROM combined
    )
SELECT n.id, n.text, n.original_text, n.source, n.page, n.heading, n.is_feedback,
    (p_vector_weight * n.norm_vec + p_bm25_weight * n.norm_txt)::REAL AS hybrid_score,
    n.txt_rank::REAL AS bm25_score,
    n.vec_sim::REAL AS vector_similarity
FROM normalized n
ORDER BY hybrid_score DESC
LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
