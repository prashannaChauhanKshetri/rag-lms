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

# Initialize on import
try:
    init_db()
except Exception as e:
    logger.warning(f"Database initialization skipped: {e}")
