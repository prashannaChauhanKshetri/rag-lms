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
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Any
from contextlib import contextmanager
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection parameters
DB_PARAMS = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': os.getenv('POSTGRES_PORT', '5432'),
    'database': os.getenv('POSTGRES_DB', 'rag_lms'),
    'user': os.getenv('POSTGRES_USER', 'rag_lms_user'),
    'password': os.getenv('POSTGRES_PASSWORD', 'raglms_secure_2025')
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
    import hashlib
    import uuid
    
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Check if users exist
            cur.execute("SELECT COUNT(*) as count FROM users")
            result = cur.fetchone()
            existing = result['count'] if result else 0
            
            if existing == 0:
                # Create demo users
                demo_users = [
                    {
                        'id': str(uuid.uuid4()),
                        'username': 'admin',
                        'password': 'admin123',
                        'role': 'admin',
                        'email': 'admin@raglms.com',
                        'full_name': 'Admin User'
                    },
                    {
                        'id': str(uuid.uuid4()),
                        'username': 'instructor',
                        'password': 'instructor123',
                        'role': 'instructor',
                        'email': 'instructor@raglms.com',
                        'full_name': 'Demo Instructor'
                    },
                    {
                        'id': str(uuid.uuid4()),
                        'username': 'student',
                        'password': 'student123',
                        'role': 'student',
                        'email': 'student@raglms.com',
                        'full_name': 'Demo Student'
                    }
                ]
                
                for user in demo_users:
                    password_hash = hashlib.sha256(user['password'].encode()).hexdigest()
                    cur.execute(
                        """INSERT INTO users (id, username, password_hash, role, email, full_name) 
                           VALUES (%s, %s, %s, %s, %s, %s)""",
                        (user['id'], user['username'], password_hash, user['role'], 
                         user['email'], user['full_name'])
                    )
                
                logger.info("Demo users created: admin/admin123, instructor/instructor123, student/student123")

# --- User Authentication ---

def create_user(username: str, password: str, role: str, email: str = None, full_name: str = None) -> str:
    """Create a new user"""
    import hashlib
    import uuid
    
    user_id = str(uuid.uuid4())
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (id, username, password_hash, role, email, full_name) 
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (user_id, username, password_hash, role, email, full_name)
            )
    
    return user_id

def verify_user(username: str, password: str) -> Optional[Dict]:
    """Verify user credentials and return user data"""
    import hashlib
    
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM users WHERE username = %s AND password_hash = %s",
                (username, password_hash)
            )
            user = cur.fetchone()
    
    return dict(user) if user else None

def get_user(user_id: str) -> Optional[Dict]:
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

def list_users() -> List[Dict]:
    """List all users"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT id, username, email, full_name, role, created_at FROM users ORDER BY created_at DESC")
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

def list_chatbots() -> List[Dict]:
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
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

def create_assignment(assignment_id: str, chatbot_id: str, title: str, description: str, due_date: datetime):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO assignments (id, chatbot_id, title, description, due_date, status) 
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (assignment_id, chatbot_id, title, description, due_date, 'draft')
            )

def list_assignments(chatbot_id: str) -> List[Dict]:
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

def create_class(class_id: str, chatbot_id: str, name: str, teacher_id: str, description: Optional[str] = None, grade_level: Optional[str] = None):
    """Create a new class"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO classes (id, chatbot_id, name, teacher_id, description, grade_level)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (class_id, chatbot_id, name, teacher_id, description, grade_level)
            )

def get_class(class_id: str) -> Optional[Dict]:
    """Get class by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM classes WHERE id = %s", (class_id,))
            cls = cur.fetchone()
    return dict(cls) if cls else None

def list_classes_for_teacher(teacher_id: str) -> List[Dict]:
    """List all classes taught by a teacher"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM classes WHERE teacher_id = %s ORDER BY created_at DESC",
                (teacher_id,)
            )
            classes = cur.fetchall()
    return [dict(c) for c in classes]

def list_classes_for_chatbot(chatbot_id: str) -> List[Dict]:
    """List all classes for a chatbot"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM classes WHERE chatbot_id = %s ORDER BY created_at DESC",
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
    """Delete a class and all associated sections"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM classes WHERE id = %s", (class_id,))

# --- SECTIONS (Course Management) ---

def create_section(section_id: str, chatbot_id: str, name: str, teacher_id: str, class_id: Optional[str] = None, schedule: Optional[Dict] = None):
    """Create a new section for a course"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO sections (id, class_id, chatbot_id, name, teacher_id, schedule)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (section_id, class_id, chatbot_id, name, teacher_id, psycopg2.extras.Json(schedule or {}))
            )

def get_section(section_id: str) -> Optional[Dict]:
    """Get section by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM sections WHERE id = %s", (section_id,))
            section = cur.fetchone()
    return dict(section) if section else None

def list_sections_for_chatbot(chatbot_id: str) -> List[Dict]:
    """List all sections for a chatbot"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM sections WHERE chatbot_id = %s ORDER BY created_at DESC",
                (chatbot_id,)
            )
            sections = cur.fetchall()
    return [dict(s) for s in sections]

def list_sections_for_teacher(teacher_id: str) -> List[Dict]:
    """List all sections taught by a teacher"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM sections WHERE teacher_id = %s ORDER BY created_at DESC",
                (teacher_id,)
            )
            sections = cur.fetchall()
    return [dict(s) for s in sections]

def get_sections_by_class(class_id: str) -> List[Dict]:
    """Get all sections for a class"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                "SELECT * FROM sections WHERE class_id = %s ORDER BY created_at DESC",
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

# --- ENROLLMENTS ---

def enroll_student(enrollment_id: str, section_id: str, student_id: str):
    """Enroll a student in a section"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO enrollments (id, section_id, student_id)
                   VALUES (%s, %s, %s)""",
                (enrollment_id, section_id, student_id)
            )

def list_enrollments(section_id: str) -> List[Dict]:
    """List all enrollments for a section"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT e.*, u.username, u.full_name, u.email 
                   FROM enrollments e
                   JOIN users u ON e.student_id = u.id
                   WHERE e.section_id = %s
                   ORDER BY u.full_name""",
                (section_id,)
            )
            enrollments = cur.fetchall()
    return [dict(e) for e in enrollments]

def list_student_sections(student_id: str) -> List[Dict]:
    """List all sections a student is enrolled in"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT s.*, u.full_name as teacher_name
                   FROM enrollments e
                   JOIN sections s ON e.section_id = s.id
                   JOIN users u ON s.teacher_id = u.id
                   WHERE e.student_id = %s
                   ORDER BY s.created_at DESC""",
                (student_id,)
            )
            sections = cur.fetchall()
    return [dict(s) for s in sections]

def remove_enrollment(section_id: str, student_id: str):
    """Remove a student from a section"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM enrollments WHERE section_id = %s AND student_id = %s",
                (section_id, student_id)
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

# --- ASSIGNMENTS ---

def create_assignment(assignment_id: str, section_id: str, title: str, description: str = "", due_date: str = None, points: int = 0):
    """Create an assignment"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO assignments (id, section_id, title, description, due_date, points)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (assignment_id, section_id, title, description, due_date, points)
            )

def get_assignment(assignment_id: str) -> Optional[Dict]:
    """Get assignment by ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM assignments WHERE id = %s", (assignment_id,))
            assignment = cur.fetchone()
    return dict(assignment) if assignment else None

def list_assignments(section_id: str, published_only: bool = False) -> List[Dict]:
    """List assignments for a section"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            if published_only:
                cur.execute(
                    """SELECT * FROM assignments
                       WHERE section_id = %s AND is_published = TRUE
                       ORDER BY due_date ASC, created_at DESC""",
                    (section_id,)
                )
            else:
                cur.execute(
                    """SELECT * FROM assignments
                       WHERE section_id = %s
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
    """Delete an assignment"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM assignments WHERE id = %s", (assignment_id,))

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

def create_teacher_profile(user_id: str, first_name: str = None, last_name: str = None, phone: str = None, 
                          bio: str = None, qualifications: str = None, department: str = None):
    """Create a teacher profile"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            profile_id = str(uuid.uuid4())
            cur.execute(
                """INSERT INTO teacher_profiles (id, user_id, first_name, last_name, phone, bio, qualifications, department)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (profile_id, user_id, first_name, last_name, phone, bio, qualifications, department)
            )

def get_teacher_profile(user_id: str) -> Optional[Dict]:
    """Get teacher profile by user ID"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("SELECT * FROM teacher_profiles WHERE user_id = %s", (user_id,))
            profile = cur.fetchone()
    return dict(profile) if profile else None

def get_all_teachers() -> List[Dict]:
    """Get all teacher profiles with user details"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT tp.*, u.email, u.full_name, u.username
                FROM teacher_profiles tp
                JOIN users u ON tp.user_id = u.id
                ORDER BY tp.last_name, tp.first_name
            """)
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

def list_assignments_for_section(section_id: str) -> List[Dict]:
    """List assignments for a specific section"""
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute("""
                SELECT a.* FROM assignments a
                JOIN sections s ON a.chatbot_id = s.chatbot_id
                WHERE s.id = %s
                ORDER BY a.created_at DESC
            """, (section_id,))
            assignments = cur.fetchall()
    return [dict(a) for a in assignments]

# Initialize on import
try:
    init_db()
    create_assignment_submission_table()
except Exception as e:
    logger.warning(f"Database initialization skipped: {e}")
