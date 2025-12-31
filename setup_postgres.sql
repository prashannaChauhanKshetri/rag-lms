-- PostgreSQL Database Setup for RAG-LMS
-- This script creates the database, enables pgvector, and creates all necessary tables

-- First, install pgvector extension (run as superuser if needed)
-- If you don't have pgvector installed, install it:
-- brew install pgvector (for macOS)

-- Create database (run this from psql command line as postgres user)
-- CREATE DATABASE rag_lms;
-- \c rag_lms;

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'instructor', 'student')),
    email TEXT,
    full_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- CHATBOTS (COURSES)
-- ============================================

CREATE TABLE IF NOT EXISTS chatbots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    greeting TEXT,
    external_knowledge_ratio REAL DEFAULT 0.5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chatbots_created ON chatbots(created_at DESC);

-- ============================================
-- DOCUMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    chunk_count INTEGER DEFAULT 0
);

CREATE INDEX idx_documents_chatbot ON documents(chatbot_id);
CREATE INDEX idx_documents_upload_date ON documents(upload_date DESC);

-- ============================================
-- DOCUMENT CHUNKS (NEW - WITH VECTORS)
-- ============================================

CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    original_text TEXT,
    embedding vector(384),  -- pgvector column for 384-dimensional embeddings
    source TEXT,  -- Document filename
    page INTEGER,
    heading TEXT,  -- Chapter/section name
    is_feedback BOOLEAN DEFAULT FALSE,
    metadata JSONB,  -- Additional metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vector similarity index (IVFFlat for cosine similarity)
CREATE INDEX idx_chunks_embedding ON document_chunks 
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Full-text search index for BM25-style keyword search
CREATE INDEX idx_chunks_text_search ON document_chunks 
    USING gin (to_tsvector('english', text));

-- Filter indexes
CREATE INDEX idx_chunks_chatbot ON document_chunks(chatbot_id);
CREATE INDEX idx_chunks_source ON document_chunks(source);
CREATE INDEX idx_chunks_feedback ON document_chunks(is_feedback);
CREATE INDEX idx_chunks_created ON document_chunks(created_at DESC);

-- ============================================
-- CONVERSATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sources JSONB,  -- Changed from TEXT to JSONB
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_chatbot ON conversations(chatbot_id);
CREATE INDEX idx_conversations_timestamp ON conversations(timestamp DESC);

-- ============================================
-- FEEDBACK
-- ============================================

CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    original_answer TEXT,
    corrected_answer TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_conversation ON feedback(conversation_id);
CREATE INDEX idx_feedback_timestamp ON feedback(timestamp DESC);

-- ============================================
-- QUIZZES
-- ============================================

CREATE TABLE IF NOT EXISTS quizzes (
    id TEXT PRIMARY KEY,
    chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP
);

CREATE INDEX idx_quizzes_chatbot ON quizzes(chatbot_id);
CREATE INDEX idx_quizzes_published ON quizzes(is_published);
CREATE INDEX idx_quizzes_created ON quizzes(created_at DESC);

-- ============================================
-- QUIZ QUESTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'true_false', 'very_short_answer', 'short_answer', 'long_answer')),
    options JSONB,  -- Changed from TEXT to JSONB
    correct_answer TEXT NOT NULL,
    points INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0
);

CREATE INDEX idx_questions_quiz ON questions(quiz_id);
CREATE INDEX idx_questions_order ON questions(quiz_id, order_index);

-- ============================================
-- QUIZ SUBMISSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS quiz_submissions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    answers JSONB NOT NULL,  -- Changed from TEXT to JSONB
    score REAL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_submissions_quiz ON quiz_submissions(quiz_id);
CREATE INDEX idx_submissions_student ON quiz_submissions(student_id);
CREATE INDEX idx_submissions_submitted ON quiz_submissions(submitted_at DESC);

-- ============================================
-- FLASHCARDS
-- ============================================

CREATE TABLE IF NOT EXISTS flashcards (
    id TEXT PRIMARY KEY,
    chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_flashcards_chatbot ON flashcards(chatbot_id);
CREATE INDEX idx_flashcards_published ON flashcards(is_published);
CREATE INDEX idx_flashcards_created ON flashcards(created_at DESC);

-- ============================================
-- LESSON PLANS
-- ============================================

CREATE TABLE IF NOT EXISTS lesson_plans (
    id TEXT PRIMARY KEY,
    chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    objectives JSONB,  -- Changed from TEXT to JSONB
    content TEXT NOT NULL,
    examples JSONB,  -- Changed from TEXT to JSONB
    activities JSONB,  -- Changed from TEXT to JSONB
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lesson_plans_chatbot ON lesson_plans(chatbot_id);
CREATE INDEX idx_lesson_plans_created ON lesson_plans(created_at DESC);

-- ============================================
-- USEFUL FUNCTIONS
-- ============================================

-- Function for hybrid search (combines full-text and vector search)
CREATE OR REPLACE FUNCTION hybrid_search(
    p_chatbot_id TEXT,
    p_query_text TEXT,
    p_query_embedding vector(384),
    p_limit INTEGER DEFAULT 15,
    p_bm25_weight REAL DEFAULT 0.3,
    p_vector_weight REAL DEFAULT 0.7
)
RETURNS TABLE (
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
) AS $$
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        SELECT 
            dc.id,
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
    ),
    text_results AS (
        SELECT 
            dc.id,
            dc.text,
            dc.original_text,
            dc.source,
            dc.page,
            dc.heading,
            dc.is_feedback,
            ts_rank(to_tsvector('english', dc.text), plainto_tsquery('english', p_query_text)) AS rank
        FROM document_chunks dc
        WHERE 
            dc.chatbot_id = p_chatbot_id
            AND to_tsvector('english', dc.text) @@ plainto_tsquery('english', p_query_text)
        ORDER BY rank DESC
        LIMIT p_limit * 2
    ),
    combined AS (
        SELECT DISTINCT ON (dc.id)
            dc.id,
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
        SELECT 
            *,
            CASE WHEN MAX(vec_sim) OVER () > 0 
                THEN vec_sim / MAX(vec_sim) OVER () 
                ELSE 0 
            END AS norm_vec,
            CASE WHEN MAX(txt_rank) OVER () > 0 
                THEN txt_rank / MAX(txt_rank) OVER () 
                ELSE 0 
            END AS norm_txt
        FROM combined
    )
    SELECT 
        n.id,
        n.text,
        n.original_text,
        n.source,
        n.page,
        n.heading,
        n.is_feedback,
        (p_vector_weight * n.norm_vec + p_bm25_weight * n.norm_txt)::REAL AS hybrid_score,
        n.txt_rank::REAL AS bm25_score,
        n.vec_sim::REAL AS vector_similarity
    FROM normalized n
    ORDER BY hybrid_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- INITIALIZATION COMPLETE
-- ============================================

-- Print success message
DO $$
BEGIN
    RAISE NOTICE 'RAG-LMS PostgreSQL schema created successfully!';
    RAISE NOTICE 'pgvector extension enabled';
    RAISE NOTICE 'All tables, indexes, and functions created';
END $$;
