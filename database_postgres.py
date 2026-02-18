# database_postgres.py
"""
PostgreSQL Database for RAG-LMS with pgvector support
Manages chatbots, documents, conversations, and feedback
"""
import psycopg2
import psycopg2.extras
import json
import logging
import os
import sys
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from contextlib import contextmanager
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection parameters - REQUIRE all env vars (FIX CRITICAL VULNERABILITY)
POSTGRES_HOST = os.getenv('POSTGRES_HOST')
POSTGRES_USER = os.getenv('POSTGRES_USER')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD')
POSTGRES_DB = os.getenv('POSTGRES_DB')
POSTGRES_PORT = os.getenv('POSTGRES_PORT', '5432')

if not all([POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB]):
    missing = []
    if not POSTGRES_HOST: missing.append("POSTGRES_HOST")
    if not POSTGRES_USER: missing.append("POSTGRES_USER")
    if not POSTGRES_PASSWORD: missing.append("POSTGRES_PASSWORD")
    if not POSTGRES_DB: missing.append("POSTGRES_DB")
    
    logging.error(f"CRITICAL: Missing required database environment variables: {', '.join(missing)}")
    logging.error("Please set these in your .env file and restart the server.")
    sys.exit(1)

DB_PARAMS = {
    'host': POSTGRES_HOST,
    'port': POSTGRES_PORT,
    'database': POSTGRES_DB,
    'user': POSTGRES_USER,
    'password': POSTGRES_PASSWORD
}

logger = logging.getLogger("rag-db")

@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    conn = psycopg2.connect(**DB_PARAMS)
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        conn.close()

def get_dict_cursor(conn):
    """Get a cursor that returns dictionaries"""
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def init_db():
    """
    Initialize database - tables should already be created by setup_postgres.sql
    This function just creates demo users if they don't exist
    """
    logger.info("Checking database connection...")
    try:
        with get_db_connection() as conn:
            with get_dict_cursor(conn) as cur:
                cur.execute("SELECT 1")
                logger.info("✓ Database connection successful")
        
        # Create demo users
        create_demo_users()
        logger.info("✓ Database initialized")
    except Exception as e:
        logger.error(f"✗ Database initialization failed: {e}")
        raise

def create_demo_users():
    """Create demo users for testing"""
    import utils_auth
    import uuid
    
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Check if institutions exist
            cur.execute("SELECT COUNT(*) as count FROM institutions")
            inst_result = cur.fetchone()
            inst_count = inst_result['count'] if inst_result else 0
            
            # Create default institution if needed
            default_institution_id = None
            if inst_count == 0:
                default_institution_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO institutions (id, name, code, domain, is_active)
                    VALUES (%s, %s, %s, %s, %s)
                """, (default_institution_id, 'Default Institution', 'default', 'localhost', True))
            else:
                cur.execute("SELECT id FROM institutions LIMIT 1")
                inst_result = cur.fetchone()
                default_institution_id = inst_result['id'] if inst_result else None
            
            # Check if superadmin exists
            cur.execute("SELECT id FROM users WHERE username = %s", ('superadmin',))
            superadmin_exists = cur.fetchone() is not None
            
            # Check if other demo users exist
            cur.execute("SELECT COUNT(*) as count FROM users")
            result = cur.fetchone()
            existing = result['count'] if result else 0
            
            # Create missing demo users
            if not superadmin_exists:
                # Create superadmin user only
                super_admin_id = str(uuid.uuid4())
                
                password_hash = utils_auth.get_password_hash('superadmin123')
                cur.execute(
                    """INSERT INTO users (id, username, password_hash, role, email, full_name, institution_id, is_email_verified) 
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    (super_admin_id, 'superadmin', password_hash, 'super_admin', 
                     'superadmin@raglms.com', 'Super Admin', None, True)
                )
                
                logger.info("✓ Superadmin user created: superadmin/superadmin123")

# --- User Authentication ---

def create_user(username: str, password: str, role: str, email: str = None, full_name: str = None,
                institution_id: str = None, is_email_verified: bool = False) -> str:
    """Create a new user with institution support"""
    import utils_auth
    
    user_id = str(uuid.uuid4())
    password_hash = utils_auth.get_password_hash(password)
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (id, username, password_hash, role, email, full_name, institution_id, is_email_verified) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (user_id, username, password_hash, role, email, full_name, institution_id, is_email_verified)
            )
    
    return user_id

def get_user_by_id(user_id: str) -> Optional[Dict]:
    """Get user by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
    return dict(user) if user else None

def get_user_by_username(username: str) -> Optional[Dict]:
    """Get user by username"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM users WHERE username = %s", (username,))
            user = cur.fetchone()
    return dict(user) if user else None

def get_user_by_email(email: str) -> Optional[Dict]:
    """Get user by email"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM users WHERE email = %s", (email,))
            user = cur.fetchone()
    return dict(user) if user else None

def update_user_password(user_id: str, password_hash: str) -> bool:
    """Update user password hash"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("UPDATE users SET password_hash = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", 
                       (password_hash, user_id))
    return True

def list_users(institution_id: str = None) -> List[Dict]:
    """List all users (optionally filtered by institution)"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            query = "SELECT id, username, email, full_name, role, institution_id, created_at FROM users"
            params = []
            
            if institution_id:
                query += " WHERE institution_id = %s"
                params.append(institution_id)
            
            query += " ORDER BY created_at DESC"
            
            cur.execute(query, params)
            users = cur.fetchall()
    return [dict(u) for u in users]

# --- Chatbot Operations ---

def create_chatbot(chatbot_id: str, name: str, greeting: str = "Hello! How can I help you?", ratio: float = 0.5):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO chatbots (id, name, greeting, external_knowledge_ratio) 
                   VALUES (%s, %s, %s, %s)""",
                (chatbot_id, name, greeting, ratio)
            )

def get_chatbot(chatbot_id: str) -> Optional[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM chatbots WHERE id = %s", (chatbot_id,))
            chatbot = cur.fetchone()
    return dict(chatbot) if chatbot else None

def list_chatbots(institution_id: str = None) -> List[Dict]:
    """List all chatbots (optionally filtered by institution via class usage)"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            if institution_id:
                # If filtering by institution, only show chatbots used in that institution's classes
                # OR chatbots that are not assigned to ANY class (optional, but safer to hide)
                # For this specific requirement, we'll show chatbots linked to the institution's classes.
                query = """
                    SELECT DISTINCT cb.* 
                    FROM chatbots cb
                    JOIN class_subjects cs ON cs.chatbot_id = cb.id
                    JOIN classes c ON c.id = cs.class_id
                    WHERE c.institution_id = %s
                    ORDER BY cb.created_at DESC
                """
                cur.execute(query, (institution_id,))
            else:
                cur.execute("SELECT * FROM chatbots ORDER BY created_at DESC")
            
            chatbots = cur.fetchall()
    return [dict(c) for c in chatbots]

def update_chatbot(chatbot_id: str, name: str = None, greeting: str = None, ratio: float = None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            updates = []
            params = []
            
            if name is not None:
                updates.append("name = %s")
                params.append(name)
            if greeting is not None:
                updates.append("greeting = %s")
                params.append(greeting)
            if ratio is not None:
                updates.append("external_knowledge_ratio = %s")
                params.append(ratio)
                
            if updates:
                params.append(chatbot_id)
                query = f"UPDATE chatbots SET {', '.join(updates)} WHERE id = %s"
                cur.execute(query, params)

def delete_chatbot(chatbot_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM chatbots WHERE id = %s", (chatbot_id,))

# --- Document Operations ---

def add_document(chatbot_id: str, filename: str, chunk_count: int):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO documents (chatbot_id, filename, chunk_count) VALUES (%s, %s, %s)",
                (chatbot_id, filename, chunk_count)
            )

def list_documents(chatbot_id: str) -> List[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM documents WHERE chatbot_id = %s ORDER BY upload_date DESC", 
                (chatbot_id,)
            )
            docs = cur.fetchall()
    return [dict(d) for d in docs]

# --- Conversation Operations ---

def log_conversation(conv_id: str, chatbot_id: str, question: str, answer: str, sources: List[Dict]):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO conversations (id, chatbot_id, question, answer, sources) 
                   VALUES (%s, %s, %s, %s, %s)""",
                (conv_id, chatbot_id, question, answer, json.dumps(sources))
            )

def get_conversations(chatbot_id: str, limit: int = 50) -> List[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT * FROM conversations WHERE chatbot_id = %s 
                   ORDER BY timestamp DESC LIMIT %s""", 
                (chatbot_id, limit)
            )
            convs = cur.fetchall()
    
    results = []
    for c in convs:
        d = dict(c)
        if d['sources']:
            if isinstance(d['sources'], str):
                try:
                    d['sources'] = json.loads(d['sources'])
                except:
                    d['sources'] = []
        results.append(d)
    return results

def get_conversation(conversation_id: str) -> Optional[Dict]:
    """Get a single conversation by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM conversations WHERE id = %s", (conversation_id,))
            conv = cur.fetchone()
    
    if conv:
        d = dict(conv)
        if d['sources'] and isinstance(d['sources'], str):
            try:
                d['sources'] = json.loads(d['sources'])
            except:
                d['sources'] = []
        return d
    return None

# --- Feedback Operations ---

def add_feedback(conversation_id: str, original_answer: str, corrected_answer: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO feedback (conversation_id, original_answer, corrected_answer) 
                   VALUES (%s, %s, %s)""",
                (conversation_id, original_answer, corrected_answer)
            )

# --- Quiz Operations ---

def create_quiz(quiz_id: str, chatbot_id: str, title: str, description: str = ""):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO quizzes (id, chatbot_id, title, description) VALUES (%s, %s, %s, %s)",
                (quiz_id, chatbot_id, title, description)
            )

def add_question(question_id: str, quiz_id: str, question_text: str, question_type: str, 
                 correct_answer: str, options: List[str] = None, points: int = 1, order_index: int = 0):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO questions (id, quiz_id, question_text, question_type, options, 
                   correct_answer, points, order_index) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (question_id, quiz_id, question_text, question_type, 
                 json.dumps(options) if options else None, correct_answer, points, order_index)
            )

def get_quiz(quiz_id: str) -> Optional[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM quizzes WHERE id = %s", (quiz_id,))
            quiz = cur.fetchone()
    return dict(quiz) if quiz else None

def list_quizzes(chatbot_id: str, published_only: bool = False) -> List[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            if published_only:
                cur.execute(
                    """SELECT * FROM quizzes WHERE chatbot_id = %s AND is_published = TRUE 
                       ORDER BY created_at DESC""",
                    (chatbot_id,)
                )
            else:
                cur.execute(
                    "SELECT * FROM quizzes WHERE chatbot_id = %s ORDER BY created_at DESC",
                    (chatbot_id,)
                )
            quizzes = cur.fetchall()
    return [dict(q) for q in quizzes]

def get_quiz_questions(quiz_id: str) -> List[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM questions WHERE quiz_id = %s ORDER BY order_index",
                (quiz_id,)
            )
            questions = cur.fetchall()
    
    results = []
    for q in questions:
        d = dict(q)
        if d['options']:
            if isinstance(d['options'], str):
                try:
                    d['options'] = json.loads(d['options'])
                except:
                    d['options'] = []
        results.append(d)
    return results

def publish_quiz(quiz_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE quizzes SET is_published = TRUE, published_at = CURRENT_TIMESTAMP WHERE id = %s",
                (quiz_id,)
            )

def unpublish_quiz(quiz_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE quizzes SET is_published = FALSE, published_at = NULL WHERE id = %s",
                (quiz_id,)
            )

def delete_quiz(quiz_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM quizzes WHERE id = %s", (quiz_id,))

def delete_question(question_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM questions WHERE id = %s", (question_id,))

def submit_quiz(submission_id: str, quiz_id: str, student_id: str, answers: Dict, score: float):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO quiz_submissions (id, quiz_id, student_id, answers, score) 
                   VALUES (%s, %s, %s, %s, %s)""",
                (submission_id, quiz_id, student_id, json.dumps(answers), score)
            )

def get_quiz_submissions(quiz_id: str) -> List[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT * FROM quiz_submissions WHERE quiz_id = %s 
                   ORDER BY submitted_at DESC""",
                (quiz_id,)
            )
            submissions = cur.fetchall()
    
    results = []
    for s in submissions:
        d = dict(s)
        if d['answers']:
            if isinstance(d['answers'], str):
                try:
                    d['answers'] = json.loads(d['answers'])
                except:
                    d['answers'] = {}
        results.append(d)
    return results

# --- Flashcard Operations ---

def create_flashcard(flashcard_id: str, chatbot_id: str, front: str, back: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO flashcards (id, chatbot_id, front, back) VALUES (%s, %s, %s, %s)",
                (flashcard_id, chatbot_id, front, back)
            )

def list_flashcards(chatbot_id: str, published_only: bool = False) -> List[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            if published_only:
                cur.execute(
                    """SELECT * FROM flashcards WHERE chatbot_id = %s AND is_published = TRUE 
                       ORDER BY created_at DESC""",
                    (chatbot_id,)
                )
            else:
                cur.execute(
                    "SELECT * FROM flashcards WHERE chatbot_id = %s ORDER BY created_at DESC",
                    (chatbot_id,)
                )
            flashcards = cur.fetchall()
    return [dict(f) for f in flashcards]

def publish_flashcard(flashcard_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE flashcards SET is_published = TRUE WHERE id = %s",
                (flashcard_id,)
            )

def delete_flashcard(flashcard_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM flashcards WHERE id = %s", (flashcard_id,))

# --- Lesson Plan Operations ---

def create_lesson_plan(plan_id: str, chatbot_id: str, title: str, topic: str, 
                       content: str, objectives: List[str] = None, 
                       examples: List[str] = None, activities: List[str] = None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO lesson_plans (id, chatbot_id, title, topic, objectives, 
                   content, examples, activities) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (plan_id, chatbot_id, title, topic, 
                 json.dumps(objectives) if objectives else None,
                 content,
                 json.dumps(examples) if examples else None,
                 json.dumps(activities) if activities else None)
            )

def list_lesson_plans(chatbot_id: str) -> List[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM lesson_plans WHERE chatbot_id = %s ORDER BY created_at DESC",
                (chatbot_id,)
            )
            plans = cur.fetchall()
    
    results = []
    for p in plans:
        d = dict(p)
        for field in ['objectives', 'examples', 'activities']:
            if d.get(field):
                if isinstance(d[field], str):
                    try:
                        d[field] = json.loads(d[field])
                    except:
                        d[field] = []
        results.append(d)
    return results

def get_lesson_plan(plan_id: str) -> Optional[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM lesson_plans WHERE id = %s", (plan_id,))
            plan = cur.fetchone()
    
    if plan:
        d = dict(plan)
        for field in ['objectives', 'examples', 'activities']:
            if d.get(field):
                if isinstance(d[field], str):
                    try:
                        d[field] = json.loads(d[field])
                    except:
                        d[field] = []
        return d
    return None

def delete_lesson_plan(plan_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM lesson_plans WHERE id = %s", (plan_id,))

# --- Assignment Operations ---

def list_assignments_by_chatbot(chatbot_id: str) -> List[Dict]:
    """RENAMED: was list_assignments(chatbot_id) - list assignments by chatbot ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM assignments WHERE chatbot_id = %s ORDER BY created_at DESC", 
                (chatbot_id,)
            )
            assigns = cur.fetchall()
    return [dict(a) for a in assigns]

def publish_assignment(assignment_id: str):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE assignments SET status = 'published' WHERE id = %s",
                (assignment_id,)
            )

def delete_assignment(assignment_id: str):
    """Delete an assignment"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM assignments WHERE id = %s", (assignment_id,))

# --- Assignment Submission Functions ---

def create_assignment_submission_table():
    """Create assignment submissions table if it doesn't exist"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS assignment_submissions (
                    id TEXT PRIMARY KEY,
                    assignment_id TEXT NOT NULL,
                    student_id TEXT NOT NULL,
                    student_name TEXT,
                    file_path TEXT,
                    file_name TEXT,
                    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    grade FLOAT,
                    feedback TEXT
                );
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment 
                ON assignment_submissions(assignment_id);
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student 
                ON assignment_submissions(student_id);
            """)

def submit_assignment(submission_id: str, assignment_id: str, student_id: str, 
                     student_name: str, file_path: str, file_name: str):
    """Submit an assignment"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO assignment_submissions 
                (id, assignment_id, student_id, student_name, file_path, file_name)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (submission_id, assignment_id, student_id, student_name, file_path, file_name))

def get_assignment_submissions(assignment_id: str):
    """Get all submissions for an assignment"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT * FROM assignment_submissions 
                WHERE assignment_id = %s 
                ORDER BY submitted_at DESC
            """, (assignment_id,))
            return cur.fetchall()

def get_student_submission(assignment_id: str, student_id: str):
    """Check if student has already submitted"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT * FROM assignment_submissions 
                WHERE assignment_id = %s AND student_id = %s
            """, (assignment_id, student_id))
            return cur.fetchone()

def grade_assignment_submission(submission_id: str, grade: float, feedback: str):
    """Grade a submission"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE assignment_submissions 
                SET grade = %s, feedback = %s
                WHERE id = %s
            """, (grade, feedback, submission_id))

# --- CLASSES (Course Management) ---

def create_class(class_id: str, name: str, description: Optional[str] = None, grade_level: Optional[str] = None, institution_id: Optional[str] = None):
    """Create a new class (no chatbot or teacher — those are added separately)"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO classes (id, name, description, grade_level, institution_id)
                   VALUES (%s, %s, %s, %s, %s)""",
                (class_id, name, description, grade_level, institution_id)
            )

def get_class(class_id: str) -> Optional[Dict]:
    """Get class by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM classes WHERE id = %s", (class_id,))
            cls = cur.fetchone()
    return dict(cls) if cls else None

def list_classes_for_teacher(teacher_id: str) -> List[Dict]:
    """List all classes where the teacher has at least one subject assignment"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT DISTINCT c.*
                   FROM classes c
                   JOIN class_subjects cs ON cs.class_id = c.id
                   JOIN teacher_assignments ta ON ta.class_subject_id = cs.id
                   WHERE ta.teacher_id = %s
                   ORDER BY c.created_at DESC""",
                (teacher_id,)
            )
            classes = cur.fetchall()
    return [dict(c) for c in classes]

def list_classes_for_chatbot(chatbot_id: str) -> List[Dict]:
    """List all classes that have this chatbot as a subject"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT c.*
                   FROM classes c
                   JOIN class_subjects cs ON cs.class_id = c.id
                   WHERE cs.chatbot_id = %s
                   ORDER BY c.created_at DESC""",
                (chatbot_id,)
            )
            classes = cur.fetchall()
    return [dict(c) for c in classes]

def update_class(class_id: str, name: Optional[str] = None, description: Optional[str] = None, grade_level: Optional[str] = None):
    """Update class details"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            updates = []
            params = []
            if name is not None:
                updates.append("name = %s")
                params.append(name)
            if description is not None:
                updates.append("description = %s")
                params.append(description)
            if grade_level is not None:
                updates.append("grade_level = %s")
                params.append(grade_level)
            
            if updates:
                params.append(class_id)
                cur.execute(f"UPDATE classes SET {', '.join(updates)} WHERE id = %s", params)

def delete_class(class_id: str):
    """Delete a class and all associated sections, subjects, and teacher assignments (cascading)"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM classes WHERE id = %s", (class_id,))

# --- CLASS SUBJECTS (Many-to-Many: Class <-> Chatbot) ---

def add_subject_to_class(cs_id: str, class_id: str, chatbot_id: str):
    """Add a chatbot/subject to a class"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO class_subjects (id, class_id, chatbot_id)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (class_id, chatbot_id) DO NOTHING""",
                (cs_id, class_id, chatbot_id)
            )

def remove_subject_from_class(cs_id: str):
    """Remove a subject from a class (cascading deletes teacher assignments)"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM class_subjects WHERE id = %s", (cs_id,))

def list_class_subjects(class_id: str) -> List[Dict]:
    """List all subjects (chatbots) for a class, with teacher info"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT cs.id as class_subject_id, cs.class_id, cs.chatbot_id, cs.created_at,
                          cb.name as chatbot_name, cb.greeting
                   FROM class_subjects cs
                   JOIN chatbots cb ON cb.id = cs.chatbot_id
                   WHERE cs.class_id = %s
                   ORDER BY cs.created_at""",
                (class_id,)
            )
            subjects = cur.fetchall()
    return [dict(s) for s in subjects]

# --- TEACHER ASSIGNMENTS (Many-to-Many: Teacher <-> Class Subject) ---

def assign_teacher_to_subject(ta_id: str, class_subject_id: str, teacher_id: str):
    """Assign a teacher to a specific class subject"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO teacher_assignments (id, class_subject_id, teacher_id)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (class_subject_id, teacher_id) DO NOTHING""",
                (ta_id, class_subject_id, teacher_id)
            )

def remove_teacher_assignment(ta_id: str):
    """Remove a teacher assignment"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM teacher_assignments WHERE id = %s", (ta_id,))

def list_teacher_assignments(class_id: str) -> List[Dict]:
    """List all teacher assignments for a class"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT ta.id as assignment_id, ta.teacher_id, ta.class_subject_id, ta.created_at,
                          u.full_name as teacher_name, u.username as teacher_username,
                          cb.name as subject_name, cb.id as chatbot_id
                   FROM teacher_assignments ta
                   JOIN class_subjects cs ON cs.id = ta.class_subject_id
                   JOIN chatbots cb ON cb.id = cs.chatbot_id
                   JOIN users u ON u.id = ta.teacher_id
                   WHERE cs.class_id = %s
                   ORDER BY cb.name, u.full_name""",
                (class_id,)
            )
            assignments = cur.fetchall()
    return [dict(a) for a in assignments]

def get_student_chatbots(student_id: str) -> List[Dict]:
    """Get all chatbots a student has access to via enrollment -> section -> class -> class_subjects"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT DISTINCT cb.id, cb.name, cb.greeting, c.name as class_name, c.id as class_id
                   FROM enrollments e
                   JOIN sections s ON s.id = e.section_id
                   JOIN classes c ON c.id = s.class_id
                   JOIN class_subjects cs ON cs.class_id = c.id
                   JOIN chatbots cb ON cb.id = cs.chatbot_id
                   WHERE e.student_id = %s AND e.deleted_at IS NULL AND s.deleted_at IS NULL
                   ORDER BY c.name, cb.name""",
                (student_id,)
            )
            chatbots = cur.fetchall()
    return [dict(cb) for cb in chatbots]

def is_teacher_of_section(teacher_id: str, section_id: str) -> bool:
    """Check if a teacher has any subject assignment in the parent class of this section"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT 1
                   FROM sections s
                   JOIN class_subjects cs ON cs.class_id = s.class_id
                   JOIN teacher_assignments ta ON ta.class_subject_id = cs.id
                   WHERE s.id = %s AND ta.teacher_id = %s AND s.deleted_at IS NULL
                   LIMIT 1""",
                (section_id, teacher_id)
            )
            return cur.fetchone() is not None

# --- SECTIONS (Course Management) ---

def create_section(section_id: str, name: str, class_id: str, institution_id: Optional[str] = None, schedule: Optional[Dict] = None):
    """Create a new section under a class (no chatbot or teacher — inherited from class)"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO sections (id, class_id, name, institution_id, schedule)
                   VALUES (%s, %s, %s, %s, %s)""",
                (section_id, class_id, name, institution_id, psycopg2.extras.Json(schedule or {}))
            )

def get_section(section_id: str) -> Optional[Dict]:
    """Get section by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM sections WHERE id = %s", (section_id,))
            section = cur.fetchone()
    return dict(section) if section else None

def list_sections_for_chatbot(chatbot_id: str) -> List[Dict]:
    """List all sections whose parent class has this chatbot as a subject"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT s.*
                   FROM sections s
                   JOIN classes c ON c.id = s.class_id
                   JOIN class_subjects cs ON cs.class_id = c.id
                   WHERE cs.chatbot_id = %s AND s.deleted_at IS NULL
                   ORDER BY s.created_at DESC""",
                (chatbot_id,)
            )
            sections = cur.fetchall()
    return [dict(s) for s in sections]

def list_sections_for_teacher(teacher_id: str) -> List[Dict]:
    """List all sections where the teacher has at least one subject assignment in the parent class"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT DISTINCT s.*, c.name as class_name, c.grade_level
                   FROM sections s
                   JOIN classes c ON c.id = s.class_id
                   JOIN class_subjects cs ON cs.class_id = c.id
                   JOIN teacher_assignments ta ON ta.class_subject_id = cs.id
                   WHERE ta.teacher_id = %s AND s.deleted_at IS NULL
                   ORDER BY s.created_at DESC""",
                (teacher_id,)
            )
            sections = cur.fetchall()
    return [dict(s) for s in sections]

def list_teacher_teaching_units(teacher_id: str) -> List[Dict]:
    """List all (Section, Chatbot) pairs where the teacher teaches the chatbot's subject in that section's class"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT DISTINCT
                    s.id as section_id,
                    s.name as section_name,
                    c.id as class_id,
                    c.name as class_name,
                    cb.id as chatbot_id,
                    cb.name as chatbot_name
                   FROM sections s
                   JOIN classes c ON c.id = s.class_id
                   JOIN class_subjects cs ON cs.class_id = c.id
                   JOIN chatbots cb ON cb.id = cs.chatbot_id
                   JOIN teacher_assignments ta ON ta.class_subject_id = cs.id
                   WHERE ta.teacher_id = %s AND s.deleted_at IS NULL
                   ORDER BY c.name, s.name, cb.name""",
                (teacher_id,)
            )
            units = cur.fetchall()
    return [dict(u) for u in units]

def list_all_sections(institution_id: str = None) -> List[Dict]:
    """List all sections across all classes (Admin use, excluding deleted, optionally filtered by institution)"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            query = """SELECT s.*, c.name as class_name, c.grade_level
                   FROM sections s
                   LEFT JOIN classes c ON c.id = s.class_id
                   WHERE s.deleted_at IS NULL"""
            params = []
            
            if institution_id:
                query += " AND c.institution_id = %s"
                params.append(institution_id)
                
            query += " ORDER BY s.created_at DESC"
            
            cur.execute(query, params)
            sections = cur.fetchall()
    return [dict(s) for s in sections]


def list_all_classes(institution_id: str = None) -> List[Dict]:
    """List all classes with subject count and section count (Admin use, optionally filtered by institution)"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            query = """SELECT c.*,
                          (SELECT COUNT(*) FROM sections s WHERE s.class_id = c.id AND s.deleted_at IS NULL) as section_count,
                          (SELECT COUNT(*) FROM class_subjects cs WHERE cs.class_id = c.id) as subject_count
                   FROM classes c"""
            params = []
            
            if institution_id:
                query += " WHERE c.institution_id = %s"
                params.append(institution_id)
            
            query += " ORDER BY c.created_at DESC"
            
            cur.execute(query, params)
            classes = cur.fetchall()
    return [dict(c) for c in classes]

def get_sections_by_class(class_id: str) -> List[Dict]:
    """Get all sections for a class (excluding soft-deleted)"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM sections WHERE class_id = %s AND deleted_at IS NULL ORDER BY created_at DESC",
                (class_id,)
            )
            sections = cur.fetchall()
    return [dict(s) for s in sections]

def update_section(section_id: str, name: str = None, schedule: Dict = None):
    """Update section details"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            updates = []
            params = []
            if name is not None:
                updates.append("name = %s")
                params.append(name)
            if schedule is not None:
                updates.append("schedule = %s")
                params.append(psycopg2.extras.Json(schedule))
            if updates:
                params.append(section_id)
                query = f"UPDATE sections SET {', '.join(updates)} WHERE id = %s"
                cur.execute(query, params)

def delete_section(section_id: str):
    """Soft delete a section (mark as deleted, preserve audit trail)"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check if section exists
            cur.execute("SELECT id FROM sections WHERE id = %s", (section_id,))
            if not cur.fetchone():
                raise ValueError(f"Section {section_id} not found")
            
            # Mark section as deleted but preserve data for audit trail
            cur.execute(
                "UPDATE sections SET deleted_at = CURRENT_TIMESTAMP WHERE id = %s",
                (section_id,)
            )

# --- ENROLLMENTS ---

def enroll_student(enrollment_id: str, section_id: str, student_id: str, performed_by: str = None):
    """Enroll a student in a section with audit logging"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Check if section exists
            cur.execute("SELECT id FROM sections WHERE id = %s AND deleted_at IS NULL", (section_id,))
            if not cur.fetchone():
                raise ValueError(f"Section {section_id} not found")
            
            # Check if student exists
            cur.execute("SELECT id FROM users WHERE id = %s", (student_id,))
            if not cur.fetchone():
                raise ValueError(f"Student {student_id} not found")
            
            # Try to insert new enrollment or re-activate soft-deleted one
            try:
                cur.execute(
                    """INSERT INTO enrollments (id, section_id, student_id, deleted_at)
                       VALUES (%s, %s, %s, NULL)""",
                    (enrollment_id, section_id, student_id)
                )
            except Exception as e:
                # If duplicate error, try to undelete if soft-deleted
                cur.execute(
                    """UPDATE enrollments SET deleted_at = NULL
                       WHERE section_id = %s AND student_id = %s AND deleted_at IS NOT NULL
                       RETURNING id""",
                    (section_id, student_id)
                )
                if not cur.fetchone():
                    raise e
            
            # Log audit trail
            if performed_by:
                import uuid
                audit_id = f"audit_{uuid.uuid4()}"
                cur.execute(
                    """INSERT INTO enrollment_audit (id, enrollment_id, section_id, student_id, action, performed_by, created_at)
                       VALUES (%s, %s, %s, %s, 'enrolled', %s, CURRENT_TIMESTAMP)""",
                    (audit_id, enrollment_id, section_id, student_id, performed_by)
                )

def bulk_enroll_students(section_id: str, student_ids: List[str], performed_by: str) -> Dict:
    """
    Enroll multiple students in a section at once.
    Returns dict with 'enrolled' list and 'skipped' list of conflicts.
    """
    import uuid
    enrolled = []
    skipped = []
    
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Verify section exists
            cur.execute(
                "SELECT id, institution_id FROM sections WHERE id = %s AND deleted_at IS NULL",
                (section_id,)
            )
            section = cur.fetchone()
            if not section:
                raise ValueError(f"Section {section_id} not found")
        
        with conn.cursor() as cur:
            for student_id in student_ids:
                try:
                    # Verify student exists
                    cur.execute("SELECT id FROM users WHERE id = %s", (student_id,))
                    if not cur.fetchone():
                        skipped.append({"student_id": student_id, "reason": "Student not found"})
                        continue
                    
                    enrollment_id = f"enroll_{uuid.uuid4()}"
                    
                    # Try to insert new enrollment
                    try:
                        cur.execute(
                            """INSERT INTO enrollments (id, section_id, student_id, deleted_at)
                               VALUES (%s, %s, %s, NULL)""",
                            (enrollment_id, section_id, student_id)
                        )
                        enrolled.append(student_id)
                    except Exception:
                        # If conflict, try to undelete
                        cur.execute(
                            """UPDATE enrollments SET deleted_at = NULL
                               WHERE section_id = %s AND student_id = %s AND deleted_at IS NOT NULL
                               RETURNING id""",
                            (section_id, student_id)
                        )
                        if cur.fetchone():
                            enrolled.append(student_id)
                        else:
                            skipped.append({
                                "student_id": student_id,
                                "reason": "Already enrolled"
                            })
                            continue
                    
                    # Log audit
                    audit_id = f"audit_{uuid.uuid4()}"
                    cur.execute(
                        """INSERT INTO enrollment_audit (id, enrollment_id, section_id, student_id, action, performed_by)
                           VALUES (%s, %s, %s, %s, 'enrolled', %s)""",
                        (audit_id, enrollment_id, section_id, student_id, performed_by)
                    )
                
                except Exception as e:
                    skipped.append({"student_id": student_id, "reason": str(e)[:100]})
    
    return {
        "enrolled": enrolled,
        "skipped": skipped,
        "timestamp": datetime.utcnow().isoformat()
    }

def list_enrollments(section_id: str) -> List[Dict]:
    """List all active enrollments for a section with student profiles and attendance stats"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT 
                    e.id as enrollment_id,
                    e.student_id,
                    u.username,
                    u.full_name,
                    u.email,
                    e.enrolled_at,
                    sp.roll_number,
                    sp.department,
                    sp.profile_picture_url,
                    COALESCE(
                        ROUND(100.0 * COUNT(CASE WHEN a.status = 'present' THEN 1 END) FILTER (WHERE a.status IS NOT NULL) 
                              / NULLIF(COUNT(*) FILTER (WHERE a.status IS NOT NULL), 0), 2),
                        0
                    ) as attendance_percentage
                   FROM enrollments e
                   JOIN users u ON e.student_id = u.id
                   LEFT JOIN student_profiles sp ON e.student_id = sp.user_id
                   LEFT JOIN attendance a ON e.section_id = a.section_id AND e.student_id = a.student_id
                   WHERE e.section_id = %s AND e.deleted_at IS NULL
                   GROUP BY e.id, e.student_id, u.username, u.full_name, u.email, e.enrolled_at, sp.roll_number, sp.department, sp.profile_picture_url
                   ORDER BY u.full_name""",
                (section_id,)
            )
            enrollments = cur.fetchall()
    return [dict(e) for e in enrollments]

def can_student_access_section(student_id: str, section_id: str) -> bool:
    """Check if a student is enrolled in a section using database function"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT can_student_access_section(%s, %s) as can_access",
                (student_id, section_id)
            )
            result = cur.fetchone()
            return result['can_access'] if result else False

def can_teacher_manage_section(teacher_id: str, section_id: str) -> bool:
    """Check if a teacher can manage a section using database function"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT can_teacher_manage_section(%s, %s) as can_manage",
                (teacher_id, section_id)
            )
            result = cur.fetchone()
            return result['can_manage'] if result else False

def list_student_sections(student_id: str) -> List[Dict]:
    """List all sections a student is enrolled in (excluding soft-deleted)"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT s.*
                   FROM enrollments e
                   JOIN sections s ON e.section_id = s.id
                   WHERE e.student_id = %s AND e.deleted_at IS NULL AND s.deleted_at IS NULL
                   ORDER BY s.created_at DESC""",
                (student_id,)
            )
            sections = cur.fetchall()
    return [dict(s) for s in sections]

def remove_enrollment(section_id: str, student_id: str, performed_by: str = None, reason: str = None):
    """Soft delete an enrollment (preserve audit trail)"""
    import uuid
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Get the enrollment ID for audit trail
            cur.execute(
                "SELECT id FROM enrollments WHERE section_id = %s AND student_id = %s AND deleted_at IS NULL",
                (section_id, student_id)
            )
            enrollment = cur.fetchone()
            if not enrollment:
                raise ValueError(f"No active enrollment found for student {student_id} in section {section_id}")
            
            enrollment_id = enrollment['id']
        
        with conn.cursor() as cur:
            # Soft delete the enrollment
            cur.execute(
                "UPDATE enrollments SET deleted_at = CURRENT_TIMESTAMP WHERE section_id = %s AND student_id = %s",
                (section_id, student_id)
            )
            
            # Log audit trail
            if performed_by:
                audit_id = f"audit_{uuid.uuid4()}"
                cur.execute(
                    """INSERT INTO enrollment_audit (id, enrollment_id, section_id, student_id, action, performed_by, reason)
                       VALUES (%s, %s, %s, %s, 'removed', %s, %s)""",
                    (audit_id, enrollment_id, section_id, student_id, performed_by, reason)
                )

def get_enrollment_history(section_id: str = None, student_id: str = None, enrollment_id: str = None) -> List[Dict]:
    """Get enrollment audit trail filtered by section, student, or enrollment ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            query = "SELECT * FROM enrollment_audit WHERE 1=1"
            params = []
            
            if enrollment_id:
                query += " AND enrollment_id = %s"
                params.append(enrollment_id)
            if section_id:
                query += " AND section_id = %s"
                params.append(section_id)
            if student_id:
                query += " AND student_id = %s"
                params.append(student_id)
            
            query += " ORDER BY created_at DESC LIMIT 1000"
            cur.execute(query, params)
            history = cur.fetchall()
    return [dict(h) for h in history]

def unenroll_by_institution(institution_id: str, chatbot_id: str = None, performed_by: str = None):
    """
    Soft-delete all enrollments for an institution or specific course within institution.
    Used when a course is archived/deleted.
    """
    import uuid
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Get all sections to unenroll from
            if chatbot_id:
                query = """SELECT id FROM sections 
                          WHERE institution_id = %s AND chatbot_id = %s AND deleted_at IS NULL"""
                cur.execute(query, (institution_id, chatbot_id))
            else:
                query = """SELECT id FROM sections 
                          WHERE institution_id = %s AND deleted_at IS NULL"""
                cur.execute(query, (institution_id,))
            
            section_ids = [row['id'] for row in cur.fetchall()]
        
        with conn.cursor() as cur:
            for section_id in section_ids:
                # Get all active enrollments
                cur.execute(
                    "SELECT id, student_id FROM enrollments WHERE section_id = %s AND deleted_at IS NULL",
                    (section_id,)
                )
                enrollments = cur.fetchall()
                
                for enrollment in enrollments:
                    enrollment_id, student_id = enrollment
                    
                    # Soft delete
                    cur.execute(
                        "UPDATE enrollments SET deleted_at = CURRENT_TIMESTAMP WHERE id = %s",
                        (enrollment_id,)
                    )
                    
                    # Log audit
                    if performed_by:
                        audit_id = f"audit_{uuid.uuid4()}"
                        cur.execute(
                            """INSERT INTO enrollment_audit (id, enrollment_id, section_id, student_id, action, performed_by, reason)
                               VALUES (%s, %s, %s, %s, 'unenrolled', %s, 'Course archived')""",
                            (audit_id, enrollment_id, section_id, student_id, performed_by)
                        )

# --- ATTENDANCE ---

def mark_attendance(attendance_id: str, section_id: str, student_id: str, date: str, status: str, marked_by: str, notes: str = None):
    """Mark attendance for a student"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO attendance (id, section_id, student_id, date, status, marked_by, notes)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (section_id, student_id, date) DO UPDATE
                   SET status = %s, marked_by = %s, notes = %s""",
                (attendance_id, section_id, student_id, date, status, marked_by, notes, status, marked_by, notes)
            )

def get_attendance(section_id: str, date: str) -> List[Dict]:
    """Get attendance records for a section on a specific date"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT a.*, u.full_name, u.username
                   FROM attendance a
                   JOIN users u ON a.student_id = u.id
                   WHERE a.section_id = %s AND a.date = %s
                   ORDER BY u.full_name""",
                (section_id, date)
            )
            records = cur.fetchall()
    return [dict(r) for r in records]

def get_student_attendance(section_id: str, student_id: str) -> List[Dict]:
    """Get attendance history for a student in a section"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT * FROM attendance
                   WHERE section_id = %s AND student_id = %s
                   ORDER BY date DESC""",
                (section_id, student_id)
            )
            records = cur.fetchall()
    return [dict(r) for r in records]

def get_attendance_report(section_id: str, start_date: str, end_date: str) -> Dict:
    """
    Get attendance report for a section for a date range.
    Returns aggregated stats per student: present, absent, late, excused count and percentage.
    """
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # 1. Get total distinct dates attendance was taken in this range
            cur.execute(
                """SELECT COUNT(DISTINCT date) as total_classes 
                   FROM attendance 
                   WHERE section_id = %s AND date >= %s AND date <= %s""",
                (section_id, start_date, end_date)
            )
            res = cur.fetchone()
            total_classes = res['total_classes'] if res else 0
            
            # 2. Get student stats (Left Join to include students even with no attendance records)
            cur.execute(
                """SELECT 
                    e.student_id,
                    u.full_name,
                    u.email,
                    COUNT(a.id) as records_count,
                    COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
                    COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count,
                    COUNT(CASE WHEN a.status = 'late' THEN 1 END) as late_count,
                    COUNT(CASE WHEN a.status = 'excused' THEN 1 END) as excused_count
                   FROM enrollments e
                   JOIN users u ON e.student_id = u.id
                   LEFT JOIN attendance a ON e.student_id = a.student_id 
                        AND a.section_id = e.section_id 
                        AND a.date >= %s AND a.date <= %s
                   WHERE e.section_id = %s AND e.deleted_at IS NULL
                   GROUP BY e.student_id, u.full_name, u.email
                   ORDER BY u.full_name""",
                (start_date, end_date, section_id)
            )
            student_records = cur.fetchall()
            
            # Process records to calculate percentage
            results = []
            for r in student_records:
                d = dict(r)
                # Calculate percentage based on number of statuses recorded for this student
                # (Avoids penalizing students for days before they enrolled if no record exists)
                denominator = d['records_count']
                if denominator > 0:
                    d['attendance_percentage'] = round((d['present_count'] / denominator) * 100, 2)
                else:
                    d['attendance_percentage'] = 0.0
                results.append(d)
    
    return {
        "section_id": section_id,
        "start_date": start_date,
        "end_date": end_date,
        "total_classes": total_classes,
        "student_records": results
    }

# --- ASSIGNMENTS ---

def create_assignment(assignment_id: str, section_id: str, chatbot_id: str, title: str, description: str = "", due_date: str = None, points: int = 0, attachment_url: str = None):
    """Create an assignment"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO assignments (id, section_id, chatbot_id, title, description, due_date, points, attachment_url)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (assignment_id, section_id, chatbot_id, title, description, due_date, points, attachment_url)
            )

def get_assignment(assignment_id: str) -> Optional[Dict]:
    """Get assignment by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM assignments WHERE id = %s", (assignment_id,))
            assignment = cur.fetchone()
    return dict(assignment) if assignment else None

def list_assignments_by_section(section_id: str, published_only: bool = False) -> List[Dict]:
    """RENAMED: was list_assignments(section_id) - list assignments for a section (excluding soft-deleted)"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            if published_only:
                cur.execute(
                    """SELECT * FROM assignments
                       WHERE section_id = %s AND is_published = TRUE AND deleted_at IS NULL
                       ORDER BY due_date ASC, created_at DESC""",
                    (section_id,)
                )
            else:
                cur.execute(
                    """SELECT * FROM assignments
                       WHERE section_id = %s AND deleted_at IS NULL
                       ORDER BY due_date ASC, created_at DESC""",
                    (section_id,)
                )
            assignments = cur.fetchall()
    return [dict(a) for a in assignments]

def publish_assignment(assignment_id: str):
    """Publish an assignment"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE assignments SET is_published = TRUE WHERE id = %s",
                (assignment_id,)
            )

def delete_assignment(assignment_id: str):
    """Soft delete an assignment (preserve submissions for audit)"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE assignments SET deleted_at = CURRENT_TIMESTAMP WHERE id = %s",
                (assignment_id,)
            )

def update_assignment(assignment_id: str, title: str = None, description: str = None, due_date: str = None, points: int = None):
    """Update assignment details"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            updates = []
            params = []
            if title is not None:
                updates.append("title = %s")
                params.append(title)
            if description is not None:
                updates.append("description = %s")
                params.append(description)
            if due_date is not None:
                updates.append("due_date = %s")
                params.append(due_date)
            if points is not None:
                updates.append("points = %s")
                params.append(points)
            if updates:
                params.append(assignment_id)
                query = f"UPDATE assignments SET {', '.join(updates)} WHERE id = %s"
                cur.execute(query, params)

def get_assignment_submissions_summary(assignment_id: str) -> Dict:
    """Get summary stats for assignment submissions"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Get assignment details
            cur.execute("SELECT * FROM assignments WHERE id = %s", (assignment_id,))
            assignment = cur.fetchone()
            if not assignment:
                raise ValueError(f"Assignment {assignment_id} not found")
            
            # Get submission counts and stats
            cur.execute(
                """SELECT 
                    COUNT(*) as total_submissions,
                    COUNT(CASE WHEN score IS NOT NULL THEN 1 END) as graded_count,
                    COUNT(CASE WHEN score IS NULL THEN 1 END) as pending_count,
                    AVG(score) as average_score,
                    MAX(score) as highest_score,
                    MIN(score) as lowest_score
                FROM assignment_submissions
                WHERE assignment_id = %s""",
                (assignment_id,)
            )
            stats = cur.fetchone()
    
    return {
        "assignment_id": assignment_id,
        "title": assignment["title"],
        "due_date": assignment["due_date"],
        "total_points": assignment["points"],
        "total_submissions": stats["total_submissions"] or 0,
        "graded_count": stats["graded_count"] or 0,
        "pending_count": stats["pending_count"] or 0,
        "average_score": float(stats["average_score"]) if stats["average_score"] else None,
        "highest_score": float(stats["highest_score"]) if stats["highest_score"] else None,
        "lowest_score": float(stats["lowest_score"]) if stats["lowest_score"] else None
    }

# --- ASSIGNMENT SUBMISSIONS ---

def submit_assignment(submission_id: str, assignment_id: str, student_id: str, text: str = "", file_path: str = None):
    """Submit an assignment"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO assignment_submissions (id, assignment_id, student_id, text, file_path)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (assignment_id, student_id) DO UPDATE
                   SET text = %s, file_path = %s, submitted_at = CURRENT_TIMESTAMP""",
                (submission_id, assignment_id, student_id, text, file_path, text, file_path)
            )

def get_submission(submission_id: str) -> Optional[Dict]:
    """Get a submission by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM assignment_submissions WHERE id = %s", (submission_id,))
            submission = cur.fetchone()
    return dict(submission) if submission else None

def list_submissions(assignment_id: str) -> List[Dict]:
    """List all submissions for an assignment"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT s.*, u.full_name, u.username
                   FROM assignment_submissions s
                   JOIN users u ON s.student_id = u.id
                   WHERE s.assignment_id = %s
                   ORDER BY s.submitted_at DESC""",
                (assignment_id,)
            )
            submissions = cur.fetchall()
    return [dict(s) for s in submissions]

def grade_submission(submission_id: str, score: float, feedback: str = ""):
    """Grade a submission"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE assignment_submissions SET score = %s, feedback = %s WHERE id = %s",
                (score, feedback, submission_id)
            )

# --- RESOURCES ---

def create_resource(resource_id: str, section_id: str, title: str, resource_type: str = "", url: str = None, file_path: str = None, metadata: Dict = None):
    """Create a resource"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO resources (id, section_id, title, resource_type, url, file_path, metadata)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (resource_id, section_id, title, resource_type, url, file_path, psycopg2.extras.Json(metadata or {}))
            )

def list_resources(section_id: str) -> List[Dict]:
    """List all resources for a section"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM resources WHERE section_id = %s ORDER BY created_at DESC",
                (section_id,)
            )
            resources = cur.fetchall()
    return [dict(r) for r in resources]

def delete_resource(resource_id: str):
    """Delete a resource"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM resources WHERE id = %s", (resource_id,))

# --- TEACHER PROFILES ---

def create_teacher_profile(user_id: str, institution_id: str = None, first_name: str = None, 
                          last_name: str = None, phone: str = None, bio: str = None, 
                          qualifications: str = None, department: str = None):
    """Create a teacher profile"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            profile_id = str(uuid.uuid4())
            cur.execute(
                """INSERT INTO teacher_profiles (id, user_id, institution_id, first_name, last_name, phone, bio, qualifications, department)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (profile_id, user_id, institution_id, first_name, last_name, phone, bio, qualifications, department)
            )

def get_teacher_profile(user_id: str) -> Optional[Dict]:
    """Get teacher profile by user ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM teacher_profiles WHERE user_id = %s", (user_id,))
            profile = cur.fetchone()
    return dict(profile) if profile else None

def get_all_teachers(institution_id: str = None) -> List[Dict]:
    """Get all teacher profiles with user details (optionally filtered by institution)"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            query = """
                SELECT 
                    tp.*,
                    u.email,
                    u.username,
                    i.name as institution_name
                FROM teacher_profiles tp
                JOIN users u ON u.id = tp.user_id
                LEFT JOIN institutions i ON i.id = tp.institution_id
            """
            
            params = []
            if institution_id:
                query += " WHERE tp.institution_id = %s"
                params.append(institution_id)
            
            query += " ORDER BY tp.last_name, tp.first_name"
            
            cur.execute(query, params)
            teachers = cur.fetchall()
    return [dict(t) for t in teachers]

def update_teacher_profile(user_id: str, **kwargs):
    """Update teacher profile"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            updates = []
            values = []
            for key, val in kwargs.items():
                if key in ['first_name', 'last_name', 'phone', 'bio', 'qualifications', 'office_location', 
                          'office_hours', 'department', 'years_experience', 'profile_picture_url']:
                    updates.append(f"{key} = %s")
                    values.append(val)
            if updates:
                values.append(user_id)
                query = f"UPDATE teacher_profiles SET {', '.join(updates)}, last_updated = CURRENT_TIMESTAMP WHERE user_id = %s"
                cur.execute(query, values)

def get_assignment_submission(submission_id: str) -> Optional[Dict]:
    """Get assignment submission by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM assignment_submissions WHERE id = %s", (submission_id,))
            submission = cur.fetchone()
    return dict(submission) if submission else None

def create_assignment_submission(submission_id: str, assignment_id: str, student_id: str, 
                                 file_path: str, file_name: str, notes: str = ""):
    """Create assignment submission"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO assignment_submissions (id, assignment_id, student_id, file_path, file_name, notes)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (submission_id, assignment_id, student_id, file_path, file_name, notes)
            )

def get_student_enrollments(student_id: str) -> List[Dict]:
    """Get all sections a student is enrolled in"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT e.*, s.name as section_name, c.name as class_name
                FROM enrollments e
                JOIN sections s ON e.section_id = s.id
                JOIN classes c ON s.class_id = c.id
                WHERE e.student_id = %s
                ORDER BY s.created_at DESC
            """, (student_id,))
            enrollments = cur.fetchall()
    return [dict(e) for e in enrollments]

def get_assignment(assignment_id: str) -> Optional[Dict]:
    """Get assignment by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM assignments WHERE id = %s", (assignment_id,))
            assignment = cur.fetchone()
    return dict(assignment) if assignment else None

# DELETED: Duplicate function list_assignments_for_section() removed
# Use list_assignments_by_section() instead for consistent naming

# ============================================
# INSTITUTION MANAGEMENT FUNCTIONS
# ============================================

def create_institution(name: str, code: str, domain: str = "", logo_url: str = "", 
                       contact_email: str = "") -> str:
    """Create a new institution"""
    institution_id = str(uuid.uuid4())
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                INSERT INTO institutions (id, name, code, domain, logo_url, contact_email)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (institution_id, name, code, domain, logo_url, contact_email))
    return institution_id

def get_institution(institution_id: str) -> Optional[Dict]:
    """Get institution by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM institutions WHERE id = %s", (institution_id,))
            institution = cur.fetchone()
    return dict(institution) if institution else None

def get_institution_by_domain(domain: str) -> Optional[Dict]:
    """Get institution by domain"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM institutions WHERE domain = %s AND is_active = TRUE", (domain,))
            institution = cur.fetchone()
    return dict(institution) if institution else None

def list_institutions(active_only: bool = True) -> List[Dict]:
    """List all institutions"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            if active_only:
                cur.execute("SELECT * FROM institutions WHERE is_active = TRUE ORDER BY name ASC")
            else:
                cur.execute("SELECT * FROM institutions ORDER BY name ASC")
            institutions = cur.fetchall()
    return [dict(i) for i in institutions]

def update_institution(institution_id: str, **kwargs) -> bool:
    """Update institution"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            updates = []
            values = []
            for key, val in kwargs.items():
                if key in ['name', 'code', 'domain', 'logo_url', 'contact_email', 'is_active']:
                    updates.append(f"{key} = %s")
                    values.append(val)
            if updates:
                values.append(institution_id)
                query = f"UPDATE institutions SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = %s"
                cur.execute(query, values)
                return True
    return False

def assign_admin_to_institution(user_id: str, institution_id: str, permissions: List[str] = None) -> str:
    """Assign an admin to an institution"""
    admin_id = str(uuid.uuid4())
    if permissions is None:
        permissions = ['manage_users', 'manage_courses', 'manage_assignments', 'view_analytics']
    
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Update user role to admin
            cur.execute("UPDATE users SET role = %s WHERE id = %s", ('admin', user_id))
            # Create institution admin mapping
            cur.execute("""
                INSERT INTO institution_admins (id, user_id, institution_id, permissions)
                VALUES (%s, %s, %s, %s)
            """, (admin_id, user_id, institution_id, permissions))
    return admin_id

def get_user_institution(user_id: str) -> Optional[Dict]:
    """Get institution for a user"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT institution_id FROM users WHERE id = %s", (user_id,))
            result = cur.fetchone()
    return result['institution_id'] if result else None

def get_admin_institutions(user_id: str) -> List[Dict]:
    """Get institutions managed by an admin"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT i.* FROM institutions i
                JOIN institution_admins ia ON i.id = ia.institution_id
                WHERE ia.user_id = %s
            """, (user_id,))
            institutions = cur.fetchall()
    return [dict(i) for i in institutions]

def get_institution_users(institution_id: str, role: str = None) -> List[Dict]:
    """Get all users in an institution, optionally filtered by role"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            if role:
                cur.execute("""
                    SELECT * FROM users WHERE institution_id = %s AND role = %s
                    ORDER BY created_at DESC
                """, (institution_id, role))
            else:
                cur.execute("""
                    SELECT * FROM users WHERE institution_id = %s
                    ORDER BY created_at DESC
                """, (institution_id,))
            users = cur.fetchall()
    return [dict(u) for u in users]

def is_super_admin(user_id: str) -> bool:
    """Check if user is a super admin"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT role FROM users WHERE id = %s", (user_id,))
            result = cur.fetchone()
    return result['role'] == 'super_admin' if result else False

def is_institution_admin(user_id: str, institution_id: str) -> bool:
    """Check if user is an admin for a specific institution"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT 1 FROM institution_admins 
                WHERE user_id = %s AND institution_id = %s
            """, (user_id, institution_id))
            result = cur.fetchone()
    return result is not None

# ============================================
# ANALYTICS & STUDENT MANAGEMENT FUNCTIONS
# ============================================

def get_system_analytics() -> Dict:
    """Get system-wide analytics (Super Admin only)"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Count institutions
            cur.execute("SELECT COUNT(*) as count FROM institutions WHERE is_active = TRUE")
            active_inst = cur.fetchone()['count'] or 0
            
            cur.execute("SELECT COUNT(*) as count FROM institutions")
            total_inst = cur.fetchone()['count'] or 0
            
            # Count users by role
            cur.execute("SELECT role, COUNT(*) as count FROM users GROUP BY role")
            users_by_role = {row['role']: row['count'] or 0 for row in cur.fetchall()}
            
            # Total users
            total_users = sum(users_by_role.values())
            
            # Count students per institution (top 5)
            cur.execute("""
                SELECT i.name, COUNT(u.id) as student_count
                FROM institutions i
                LEFT JOIN users u ON i.id = u.institution_id AND u.role = 'student'
                GROUP BY i.id, i.name
                ORDER BY student_count DESC
                LIMIT 5
            """)
            top_institutions = [dict(row) for row in cur.fetchall()]
            
    return {
        'total_institutions': total_inst,
        'active_institutions': active_inst,
        'total_users': total_users,
        'users_by_role': {
            'super_admin': users_by_role.get('super_admin', 0),
            'admin': users_by_role.get('admin', 0),
            'instructor': users_by_role.get('instructor', 0),
            'student': users_by_role.get('student', 0)
        },
        'top_institutions': top_institutions
    }

def get_institution_analytics(institution_id: str) -> Dict:
    """Get detailed analytics for an institution"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Get institution details
            cur.execute("SELECT * FROM institutions WHERE id = %s", (institution_id,))
            institution = cur.fetchone()
            if not institution:
                return {}
            
            # Count users by role
            cur.execute("""
                SELECT role, COUNT(*) as count FROM users 
                WHERE institution_id = %s
                GROUP BY role
            """, (institution_id,))
            users_by_role = {row['role']: row['count'] or 0 for row in cur.fetchall()}
            
            # Count active students
            cur.execute("""
                SELECT COUNT(*) as count FROM users 
                WHERE institution_id = %s AND role = 'student'
            """, (institution_id,))
            total_students = cur.fetchone()['count'] or 0
            
            # Count courses
            cur.execute("""
                SELECT COUNT(*) as count FROM chatbots 
                WHERE institution_id = %s
            """, (institution_id,))
            total_courses = cur.fetchone()['count'] or 0
            
            # Count pending assignments
            cur.execute("""
                SELECT COUNT(*) as count FROM assignments 
                WHERE chatbot_id IN (
                    SELECT id FROM chatbots WHERE institution_id = %s
                ) AND status = 'published'
            """, (institution_id,))
            pending_assignments = cur.fetchone()['count'] or 0
            
    return {
        'institution': dict(institution),
        'students_count': users_by_role.get('student', 0),
        'teachers_count': users_by_role.get('instructor', 0),
        'admins_count': users_by_role.get('admin', 0),
        'total_courses': total_courses,
        'pending_assignments': pending_assignments,
        'users_by_role': users_by_role
    }

def list_institution_students(institution_id: str, search: str = None, 
                              department: str = None, status: str = 'active',
                              limit: int = 50, offset: int = 0) -> Dict:
    """List students in an institution with filters"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Build query
            where_clause = "u.institution_id = %s AND u.role = 'student'"
            params = [institution_id]
            
            # Search filter
            if search:
                where_clause += " AND (u.full_name ILIKE %s OR u.email ILIKE %s OR u.username ILIKE %s)"
                search_term = f"%{search}%"
                params.extend([search_term, search_term, search_term])
            
            # Department filter
            if department:
                where_clause += " AND sp.department = %s"
                params.append(department)
            
            # Status filter (active/inactive)
            if status == 'active':
                where_clause += " AND u.is_email_verified = TRUE"
            
            # Get total count
            count_query = f"""
                SELECT COUNT(*) as count FROM users u
                LEFT JOIN student_profiles sp ON u.id = sp.user_id
                WHERE {where_clause}
            """
            cur.execute(count_query, params)
            total = cur.fetchone()['count'] or 0
            
            # Get students
            query = f"""
                SELECT u.id, u.username, u.email, u.full_name, u.created_at,
                       sp.roll_number, sp.batch_year, sp.department, sp.specialization
                FROM users u
                LEFT JOIN student_profiles sp ON u.id = sp.user_id
                WHERE {where_clause}
                ORDER BY u.created_at DESC
                LIMIT %s OFFSET %s
            """
            params.extend([limit, offset])
            cur.execute(query, params)
            students = [dict(row) for row in cur.fetchall()]
    
    return {
        'students': students,
        'total': total,
        'limit': limit,
        'offset': offset
    }

def get_student_detail(student_id: str) -> Optional[Dict]:
    """Get detailed student profile"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Get user info
            cur.execute("SELECT * FROM users WHERE id = %s", (student_id,))
            user = cur.fetchone()
            if not user:
                return None
            
            # Get student profile
            cur.execute("SELECT * FROM student_profiles WHERE user_id = %s", (student_id,))
            profile = cur.fetchone()
            
            # Get attendance
            cur.execute("""
                SELECT section_id, COUNT(*) as total, 
                       SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present
                FROM attendance
                WHERE student_id = %s
                GROUP BY section_id
            """, (student_id,))
            attendance_records = [dict(row) for row in cur.fetchall()]
            
    return {
        'user': dict(user),
        'profile': dict(profile) if profile else None,
        'attendance': attendance_records
    }

def get_institution_courses(institution_id: str) -> List[Dict]:
    """Get all courses for an institution"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT * FROM chatbots 
                WHERE institution_id = %s 
                ORDER BY created_at DESC
            """, (institution_id,))
            courses = [dict(row) for row in cur.fetchall()]
    return courses

def list_all_students(search: str = None, institution_id: str = None,
                      limit: int = 50, offset: int = 0) -> Dict:
    """List all students across institutions (Super Admin only)"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Build query
            where_clause = "u.role = 'student'"
            params = []
            
            # Institution filter
            if institution_id:
                where_clause += " AND u.institution_id = %s"
                params.append(institution_id)
            
            # Search filter
            if search:
                where_clause += " AND (u.full_name ILIKE %s OR u.email ILIKE %s)"
                search_term = f"%{search}%"
                params.extend([search_term, search_term])
            
            # Get total
            count_query = f"SELECT COUNT(*) as count FROM users WHERE {where_clause}"
            cur.execute(count_query, params)
            total = cur.fetchone()['count'] or 0
            
            # Get students
            query = f"""
                SELECT u.id, u.username, u.email, u.full_name, u.institution_id, u.created_at,
                       i.name as institution_name,
                       sp.roll_number, sp.department
                FROM users u
                LEFT JOIN institutions i ON u.institution_id = i.id
                LEFT JOIN student_profiles sp ON u.id = sp.user_id
                WHERE {where_clause}
                ORDER BY u.created_at DESC
                LIMIT %s OFFSET %s
            """
            params.extend([limit, offset])
            cur.execute(query, params)
            students = [dict(row) for row in cur.fetchall()]
    
    return {
        'students': students,
        'total': total,
        'limit': limit,
        'offset': offset
    }

# ============================================
# EMAIL VERIFICATION FUNCTIONS
# ============================================

def create_verification_token(user_id: str, token: str, token_type: str = 'email_verification', 
                              expires_in_minutes: int = 15) -> bool:
    """Create an email verification token"""
    token_id = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(minutes=expires_in_minutes)
    
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                INSERT INTO email_verification_tokens (id, user_id, token, token_type, expires_at)
                VALUES (%s, %s, %s, %s, %s)
            """, (token_id, user_id, token, token_type, expires_at))
    return True

def verify_token(token: str, token_type: str = 'email_verification') -> Optional[Dict]:
    """Verify a token and return associated user if valid"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT * FROM email_verification_tokens 
                WHERE token = %s AND token_type = %s AND is_used = FALSE 
                AND expires_at > CURRENT_TIMESTAMP
            """, (token, token_type))
            token_record = cur.fetchone()
    
    if token_record:
        return dict(token_record)
    return None

def mark_token_used(token: str) -> bool:
    """Mark a token as used"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("UPDATE email_verification_tokens SET is_used = TRUE WHERE token = %s", (token,))
    return True

def mark_email_verified(user_id: str) -> bool:
    """Mark user's email as verified"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("UPDATE users SET is_email_verified = TRUE WHERE id = %s", (user_id,))
    return True

def create_student_profile(user_id: str, institution_id: str, first_name: str = "", 
                          last_name: str = "", **kwargs) -> str:
    """Create a student profile"""
    profile_id = str(uuid.uuid4())
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                INSERT INTO student_profiles (id, user_id, institution_id, first_name, last_name, profile_completion_percentage)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (profile_id, user_id, institution_id, first_name, last_name, 20))
            
            # Update additional fields if provided
            if kwargs:
                updates = []
                values = []
                for key, val in kwargs.items():
                    if key in ['roll_number', 'batch_year', 'department', 'specialization', 'phone', 'bio']:
                        updates.append(f"{key} = %s")
                        values.append(val)
                if updates:
                    values.append(profile_id)
                    query = f"UPDATE student_profiles SET {', '.join(updates)} WHERE id = %s"
                    cur.execute(query, values)
    return profile_id

def get_student_profile(user_id: str) -> Optional[Dict]:
    """Get student profile by user ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM student_profiles WHERE user_id = %s", (user_id,))
            profile = cur.fetchone()
    return dict(profile) if profile else None

def update_student_profile(user_id: str, **kwargs) -> bool:
    """Update student profile"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            updates = []
            values = []
            for key, val in kwargs.items():
                if key in ['first_name', 'last_name', 'roll_number', 'batch_year', 'department', 
                          'specialization', 'phone', 'bio', 'parent_name', 'parent_email', 
                          'parent_phone', 'emergency_contact', 'profile_picture_url']:
                    updates.append(f"{key} = %s")
                    values.append(val)
            if updates:
                values.append(user_id)
                query = f"UPDATE student_profiles SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE user_id = %s"
                cur.execute(query, values)
                return True
    return False

# Initialize on import
try:
    init_db()
    create_assignment_submission_table()
except Exception as e:
    logger.warning(f"Database initialization skipped: {e}")
