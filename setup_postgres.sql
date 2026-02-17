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
-- INSTITUTIONS (MULTI-TENANT SUPPORT)
-- ============================================
CREATE TABLE IF NOT EXISTS institutions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT UNIQUE,
    domain TEXT,
    logo_url TEXT,
    contact_email TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_institutions_is_active ON institutions(is_active);
CREATE INDEX idx_institutions_domain ON institutions(domain);
-- ============================================
-- USERS & AUTHENTICATION
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (
        role IN ('super_admin', 'admin', 'instructor', 'student')
    ),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    is_email_verified BOOLEAN DEFAULT FALSE,
    institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_institution_id ON users(institution_id);
-- ============================================
-- INSTITUTION ADMINS (ROLE ASSIGNMENT)
-- ============================================
CREATE TABLE IF NOT EXISTS institution_admins (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
    permissions TEXT [],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_institution_admins_user_id ON institution_admins(user_id);
CREATE INDEX idx_institution_admins_institution_id ON institution_admins(institution_id);
-- ============================================
-- EMAIL VERIFICATION (MAGIC LINKS)
-- ============================================
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    token_type TEXT CHECK (
        token_type IN ('email_verification', 'password_reset')
    ),
    is_used BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);
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
    embedding vector(384),
    -- pgvector column for 384-dimensional embeddings
    source TEXT,
    -- Document filename
    page INTEGER,
    heading TEXT,
    -- Chapter/section name
    is_feedback BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    -- Additional metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Vector similarity index (IVFFlat for cosine similarity)
CREATE INDEX idx_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- Full-text search index for BM25-style keyword search
CREATE INDEX idx_chunks_text_search ON document_chunks USING gin (to_tsvector('english', text));
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
    sources JSONB,
    -- Changed from TEXT to JSONB
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
    question_type TEXT NOT NULL CHECK (
        question_type IN (
            'mcq',
            'true_false',
            'very_short_answer',
            'short_answer',
            'long_answer'
        )
    ),
    options JSONB,
    -- Changed from TEXT to JSONB
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
    answers JSONB NOT NULL,
    -- Changed from TEXT to JSONB
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
    objectives JSONB,
    -- Changed from TEXT to JSONB
    content TEXT NOT NULL,
    examples JSONB,
    -- Changed from TEXT to JSONB
    activities JSONB,
    -- Changed from TEXT to JSONB
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_lesson_plans_chatbot ON lesson_plans(chatbot_id);
CREATE INDEX idx_lesson_plans_created ON lesson_plans(created_at DESC);
-- ============================================
-- COURSE MANAGEMENT: CLASSES
-- ============================================
CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
    grade_level TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, institution_id)
);
CREATE INDEX idx_classes_institution ON classes(institution_id);
CREATE INDEX idx_classes_created ON classes(created_at DESC);
-- Many-to-many: which chatbots (subjects) belong to a class
CREATE TABLE IF NOT EXISTS class_subjects (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, chatbot_id)
);
CREATE INDEX idx_class_subjects_class ON class_subjects(class_id);
CREATE INDEX idx_class_subjects_chatbot ON class_subjects(chatbot_id);
-- Many-to-many: which teachers are assigned to which class-subjects
CREATE TABLE IF NOT EXISTS teacher_assignments (
    id TEXT PRIMARY KEY,
    class_subject_id TEXT NOT NULL REFERENCES class_subjects(id) ON DELETE CASCADE,
    teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_subject_id, teacher_id)
);
CREATE INDEX idx_teacher_assignments_cs ON teacher_assignments(class_subject_id);
CREATE INDEX idx_teacher_assignments_teacher ON teacher_assignments(teacher_id);
-- ============================================
-- COURSE MANAGEMENT: SECTIONS & ENROLLMENT
-- ============================================
CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
    schedule JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);
CREATE INDEX idx_sections_class ON sections(class_id);
CREATE INDEX idx_sections_institution ON sections(institution_id);
-- ============================================
-- ENROLLMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS enrollments (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id),
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,
    UNIQUE(section_id, student_id, deleted_at)
    WHERE deleted_at IS NULL
);
CREATE INDEX idx_enrollments_section ON enrollments(section_id);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_deleted ON enrollments(deleted_at);
-- ============================================
-- ATTENDANCE
-- ============================================
CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('present', 'absent', 'late', 'excused')
    ),
    marked_by TEXT NOT NULL REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(section_id, student_id, date)
);
CREATE INDEX idx_attendance_section ON attendance(section_id);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_date ON attendance(date DESC);
-- ============================================
-- ASSIGNMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP,
    points INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_published BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_assignments_section ON assignments(section_id);
CREATE INDEX idx_assignments_published ON assignments(is_published);
-- ============================================
-- ASSIGNMENT SUBMISSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS assignment_submissions (
    id TEXT PRIMARY KEY,
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id),
    file_path TEXT,
    text TEXT,
    score REAL,
    feedback TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assignment_id, student_id)
);
CREATE INDEX idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX idx_submissions_student ON assignment_submissions(student_id);
-- ============================================
-- RESOURCES
-- ============================================
CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    resource_type TEXT,
    url TEXT,
    file_path TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_resources_section ON resources(section_id);
-- ============================================
-- ENROLLMENT AUDIT TRAIL
-- ============================================
CREATE TABLE IF NOT EXISTS enrollment_audit (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT,
    section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL CHECK (action IN ('enrolled', 'unenrolled', 'removed')),
    performed_by TEXT NOT NULL REFERENCES users(id),
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_enrollment ON enrollment_audit(enrollment_id);
CREATE INDEX idx_audit_section ON enrollment_audit(section_id);
CREATE INDEX idx_audit_student ON enrollment_audit(student_id);
CREATE INDEX idx_audit_action ON enrollment_audit(action);
CREATE INDEX idx_audit_created ON enrollment_audit(created_at DESC);
-- ============================================
-- AUTHORIZATION HELPER FUNCTIONS
-- ============================================
-- Check if a teacher can manage a specific section
CREATE OR REPLACE FUNCTION can_teacher_manage_section(p_teacher_id TEXT, p_section_id TEXT) RETURNS BOOLEAN AS $$
DECLARE v_section_teacher_id TEXT;
v_teacher_institution_id TEXT;
v_section_institution_id TEXT;
BEGIN -- Get section's teacher and institution
SELECT teacher_id,
    institution_id INTO v_section_teacher_id,
    v_section_institution_id
FROM sections
WHERE id = p_section_id;
IF v_section_teacher_id IS NULL THEN RETURN FALSE;
END IF;
-- Get teacher's institution
SELECT institution_id INTO v_teacher_institution_id
FROM users
WHERE id = p_teacher_id;
-- Check ownership and institution match
RETURN (
    v_section_teacher_id = p_teacher_id
    AND v_teacher_institution_id = v_section_institution_id
);
END;
$$ LANGUAGE plpgsql STABLE;
-- Check if a student can access a specific section
CREATE OR REPLACE FUNCTION can_student_access_section(p_student_id TEXT, p_section_id TEXT) RETURNS BOOLEAN AS $$ BEGIN RETURN EXISTS (
        SELECT 1
        FROM enrollments
        WHERE section_id = p_section_id
            AND student_id = p_student_id
            AND deleted_at IS NULL
    );
END;
$$ LANGUAGE plpgsql STABLE;
-- Get teacher's institution ID
CREATE OR REPLACE FUNCTION get_teacher_institution_id(p_teacher_id TEXT) RETURNS TEXT AS $$
DECLARE v_institution_id TEXT;
BEGIN
SELECT institution_id INTO v_institution_id
FROM users
WHERE id = p_teacher_id
    AND role = 'instructor';
RETURN v_institution_id;
END;
$$ LANGUAGE plpgsql STABLE;
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
                to_tsvector('english', dc.text),
                plainto_tsquery('english', p_query_text)
            ) AS rank
        FROM document_chunks dc
        WHERE dc.chatbot_id = p_chatbot_id
            AND to_tsvector('english', dc.text) @@ plainto_tsquery('english', p_query_text)
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
            AND (
                vr.id IS NOT NULL
                OR tr.id IS NOT NULL
            )
    ),
    normalized AS (
        SELECT *,
            CASE
                WHEN MAX(vec_sim) OVER () > 0 THEN vec_sim / MAX(vec_sim) OVER ()
                ELSE 0
            END AS norm_vec,
            CASE
                WHEN MAX(txt_rank) OVER () > 0 THEN txt_rank / MAX(txt_rank) OVER ()
                ELSE 0
            END AS norm_txt
        FROM combined
    )
SELECT n.id,
    n.text,
    n.original_text,
    n.source,
    n.page,
    n.heading,
    n.is_feedback,
    (
        p_vector_weight * n.norm_vec + p_bm25_weight * n.norm_txt
    )::REAL AS hybrid_score,
    n.txt_rank::REAL AS bm25_score,
    n.vec_sim::REAL AS vector_similarity
FROM normalized n
ORDER BY hybrid_score DESC
LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
-- ============================================
-- TEACHER PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS teacher_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    bio TEXT,
    qualifications TEXT,
    specializations TEXT [],
    office_location TEXT,
    office_hours TEXT,
    department TEXT,
    years_experience INT,
    profile_picture_url TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_teacher_user_id ON teacher_profiles(user_id);
CREATE INDEX idx_teacher_institution_id ON teacher_profiles(institution_id);
CREATE INDEX idx_teacher_name ON teacher_profiles(first_name, last_name);
-- ============================================
-- STUDENT PROFILES (NEW)
-- ============================================
CREATE TABLE IF NOT EXISTS student_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    roll_number TEXT,
    batch_year INT,
    department TEXT,
    specialization TEXT,
    phone TEXT,
    profile_picture_url TEXT,
    bio TEXT,
    parent_name TEXT,
    parent_email TEXT,
    parent_phone TEXT,
    emergency_contact TEXT,
    profile_completion_percentage INT DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_student_user_id ON student_profiles(user_id);
CREATE INDEX idx_student_institution_id ON student_profiles(institution_id);
CREATE INDEX idx_student_roll_number ON student_profiles(roll_number);
CREATE INDEX idx_student_name ON student_profiles(first_name, last_name);
-- ============================================
-- SOFT DELETE SUPPORT (Added for audit trail)
-- ============================================
-- Add deleted_at column to sections if it doesn't exist
ALTER TABLE sections
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_sections_deleted ON sections(deleted_at);
-- Add deleted_at column to assignments if it doesn't exist
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_deleted ON assignments(deleted_at);
-- ============================================
-- INITIALIZATION COMPLETE
-- ============================================
-- Print success message
DO $$ BEGIN RAISE NOTICE 'RAG-LMS PostgreSQL schema created successfully!';
RAISE NOTICE 'pgvector extension enabled';
RAISE NOTICE 'All tables, indexes, and functions created';
END $$;ALTER TABLE assignments ADD COLUMN IF NOT EXISTS attachment_url TEXT;
