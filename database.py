# database.py
"""
SQLite Database for RAG-LMS
Manages chatbots, documents, conversations, and feedback
"""
import sqlite3
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any

DB_PATH = "rag_lms.db"
logger = logging.getLogger("rag-db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database tables"""
    conn = get_db_connection()
    c = conn.cursor()
    
    # Users table for authentication
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,  -- 'admin', 'instructor', 'student'
            email TEXT,
            full_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Chatbots table
    c.execute('''
        CREATE TABLE IF NOT EXISTS chatbots (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            greeting TEXT,
            external_knowledge_ratio REAL DEFAULT 0.5,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Documents table
    c.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chatbot_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            chunk_count INTEGER DEFAULT 0,
            FOREIGN KEY (chatbot_id) REFERENCES chatbots (id) ON DELETE CASCADE
        )
    ''')
    
    # Conversations table
    c.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            chatbot_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            sources TEXT,  -- JSON string
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chatbot_id) REFERENCES chatbots (id) ON DELETE CASCADE
        )
    ''')
    
    # Feedback table
    c.execute('''
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            original_answer TEXT,
            corrected_answer TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
        )
    ''')
    
    # Quizzes table
    c.execute('''
        CREATE TABLE IF NOT EXISTS quizzes (
            id TEXT PRIMARY KEY,
            chatbot_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            is_published BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            published_at TIMESTAMP,
            FOREIGN KEY (chatbot_id) REFERENCES chatbots (id) ON DELETE CASCADE
        )
    ''')
    
    # Questions table
    c.execute('''
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            quiz_id TEXT NOT NULL,
            question_text TEXT NOT NULL,
            question_type TEXT NOT NULL,  -- mcq, true_false, short_answer, long_answer
            options TEXT,  -- JSON array for MCQ options
            correct_answer TEXT NOT NULL,
            points INTEGER DEFAULT 1,
            order_index INTEGER DEFAULT 0,
            FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
        )
    ''')
    
    # Student Quiz Submissions table
    c.execute('''
        CREATE TABLE IF NOT EXISTS quiz_submissions (
            id TEXT PRIMARY KEY,
            quiz_id TEXT NOT NULL,
            student_id TEXT NOT NULL,
            answers TEXT NOT NULL,  -- JSON object {question_id: answer}
            score REAL,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
        )
    ''')
    
    # Flashcards table
    c.execute('''
        CREATE TABLE IF NOT EXISTS flashcards (
            id TEXT PRIMARY KEY,
            chatbot_id TEXT NOT NULL,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            is_published BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chatbot_id) REFERENCES chatbots (id) ON DELETE CASCADE
        )
    ''')
    
    # Lesson Plans table
    c.execute('''
        CREATE TABLE IF NOT EXISTS lesson_plans (
            id TEXT PRIMARY KEY,
            chatbot_id TEXT NOT NULL,
            title TEXT NOT NULL,
            topic TEXT NOT NULL,
            objectives TEXT,  -- JSON array
            content TEXT NOT NULL,
            examples TEXT,  -- JSON array
            activities TEXT,  -- JSON array
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chatbot_id) REFERENCES chatbots (id) ON DELETE CASCADE
        )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Database initialized")
    
    # Create default demo users if they don't exist
    create_demo_users()

def create_demo_users():
    """Create demo users for testing"""
    import hashlib
    import uuid
    
    conn = get_db_connection()
    c = conn.cursor()
    
    # Check if users exist
    existing = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    
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
            c.execute(
                "INSERT INTO users (id, username, password_hash, role, email, full_name) VALUES (?, ?, ?, ?, ?, ?)",
                (user['id'], user['username'], password_hash, user['role'], user['email'], user['full_name'])
            )
        
        conn.commit()
        logger.info("Demo users created: admin/admin123, instructor/instructor123, student/student123")
    
    conn.close()

# --- User Authentication ---

def create_user(username: str, password: str, role: str, email: str = None, full_name: str = None) -> str:
    """Create a new user"""
    import hashlib
    import uuid
    
    user_id = str(uuid.uuid4())
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO users (id, username, password_hash, role, email, full_name) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, username, password_hash, role, email, full_name)
    )
    conn.commit()
    conn.close()
    
    return user_id

def verify_user(username: str, password: str) -> Optional[Dict]:
    """Verify user credentials and return user data"""
    import hashlib
    
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    conn = get_db_connection()
    user = conn.execute(
        "SELECT * FROM users WHERE username = ? AND password_hash = ?",
        (username, password_hash)
    ).fetchone()
    conn.close()
    
    return dict(user) if user else None

def get_user(user_id: str) -> Optional[Dict]:
    """Get user by ID"""
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None

def get_user_by_username(username: str) -> Optional[Dict]:
    """Get user by username"""
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return dict(user) if user else None

# --- Chatbot Operations ---

def create_chatbot(chatbot_id: str, name: str, greeting: str = "Hello! How can I help you?", ratio: float = 0.5):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO chatbots (id, name, greeting, external_knowledge_ratio) VALUES (?, ?, ?, ?)",
        (chatbot_id, name, greeting, ratio)
    )
    conn.commit()
    conn.close()

def get_chatbot(chatbot_id: str) -> Optional[Dict]:
    conn = get_db_connection()
    chatbot = conn.execute("SELECT * FROM chatbots WHERE id = ?", (chatbot_id,)).fetchone()
    conn.close()
    return dict(chatbot) if chatbot else None

def list_chatbots() -> List[Dict]:
    conn = get_db_connection()
    chatbots = conn.execute("SELECT * FROM chatbots ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(c) for c in chatbots]

def update_chatbot(chatbot_id: str, name: str = None, greeting: str = None, ratio: float = None):
    conn = get_db_connection()
    c = conn.cursor()
    
    updates = []
    params = []
    
    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if greeting is not None:
        updates.append("greeting = ?")
        params.append(greeting)
    if ratio is not None:
        updates.append("external_knowledge_ratio = ?")
        params.append(ratio)
        
    if updates:
        params.append(chatbot_id)
        query = f"UPDATE chatbots SET {', '.join(updates)} WHERE id = ?"
        c.execute(query, params)
        conn.commit()
    
    conn.close()

def delete_chatbot(chatbot_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM chatbots WHERE id = ?", (chatbot_id,))
    conn.commit()
    conn.close()

# --- Document Operations ---

def add_document(chatbot_id: str, filename: str, chunk_count: int):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO documents (chatbot_id, filename, chunk_count) VALUES (?, ?, ?)",
        (chatbot_id, filename, chunk_count)
    )
    conn.commit()
    conn.close()

def list_documents(chatbot_id: str) -> List[Dict]:
    conn = get_db_connection()
    docs = conn.execute(
        "SELECT * FROM documents WHERE chatbot_id = ? ORDER BY upload_date DESC", 
        (chatbot_id,)
    ).fetchall()
    conn.close()
    return [dict(d) for d in docs]

# --- Conversation Operations ---

def log_conversation(conv_id: str, chatbot_id: str, question: str, answer: str, sources: List[Dict]):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO conversations (id, chatbot_id, question, answer, sources) VALUES (?, ?, ?, ?, ?)",
        (conv_id, chatbot_id, question, answer, json.dumps(sources))
    )
    conn.commit()
    conn.close()

def get_conversations(chatbot_id: str, limit: int = 50) -> List[Dict]:
    conn = get_db_connection()
    convs = conn.execute(
        "SELECT * FROM conversations WHERE chatbot_id = ? ORDER BY timestamp DESC LIMIT ?", 
        (chatbot_id, limit)
    ).fetchall()
    conn.close()
    
    results = []
    for c in convs:
        d = dict(c)
        if d['sources']:
            try:
                d['sources'] = json.loads(d['sources'])
            except:
                d['sources'] = []
        results.append(d)
    return results

# --- Feedback Operations ---

def add_feedback(conversation_id: str, original_answer: str, corrected_answer: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO feedback (conversation_id, original_answer, corrected_answer) VALUES (?, ?, ?)",
        (conversation_id, original_answer, corrected_answer)
    )
    conn.commit()
    conn.close()

# --- Quiz Operations ---

def create_quiz(quiz_id: str, chatbot_id: str, title: str, description: str = ""):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO quizzes (id, chatbot_id, title, description) VALUES (?, ?, ?, ?)",
        (quiz_id, chatbot_id, title, description)
    )
    conn.commit()
    conn.close()

def add_question(question_id: str, quiz_id: str, question_text: str, question_type: str, 
                 correct_answer: str, options: List[str] = None, points: int = 1, order_index: int = 0):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO questions (id, quiz_id, question_text, question_type, options, correct_answer, points, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (question_id, quiz_id, question_text, question_type, json.dumps(options) if options else None, correct_answer, points, order_index)
    )
    conn.commit()
    conn.close()

def get_quiz(quiz_id: str) -> Optional[Dict]:
    conn = get_db_connection()
    quiz = conn.execute("SELECT * FROM quizzes WHERE id = ?", (quiz_id,)).fetchone()
    conn.close()
    return dict(quiz) if quiz else None

def list_quizzes(chatbot_id: str, published_only: bool = False) -> List[Dict]:
    conn = get_db_connection()
    if published_only:
        quizzes = conn.execute(
            "SELECT * FROM quizzes WHERE chatbot_id = ? AND is_published = 1 ORDER BY created_at DESC",
            (chatbot_id,)
        ).fetchall()
    else:
        quizzes = conn.execute(
            "SELECT * FROM quizzes WHERE chatbot_id = ? ORDER BY created_at DESC",
            (chatbot_id,)
        ).fetchall()
    conn.close()
    return [dict(q) for q in quizzes]

def get_quiz_questions(quiz_id: str) -> List[Dict]:
    conn = get_db_connection()
    questions = conn.execute(
        "SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index",
        (quiz_id,)
    ).fetchall()
    conn.close()
    
    results = []
    for q in questions:
        d = dict(q)
        if d['options']:
            try:
                d['options'] = json.loads(d['options'])
            except:
                d['options'] = []
        results.append(d)
    return results

def publish_quiz(quiz_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "UPDATE quizzes SET is_published = 1, published_at = CURRENT_TIMESTAMP WHERE id = ?",
        (quiz_id,)
    )
    conn.commit()
    conn.close()

def unpublish_quiz(quiz_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "UPDATE quizzes SET is_published = 0, published_at = NULL WHERE id = ?",
        (quiz_id,)
    )
    conn.commit()
    conn.close()

def delete_quiz(quiz_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM quizzes WHERE id = ?", (quiz_id,))
    conn.commit()
    conn.close()

def delete_question(question_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM questions WHERE id = ?", (question_id,))
    conn.commit()
    conn.close()

def submit_quiz(submission_id: str, quiz_id: str, student_id: str, answers: Dict, score: float):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO quiz_submissions (id, quiz_id, student_id, answers, score) VALUES (?, ?, ?, ?, ?)",
        (submission_id, quiz_id, student_id, json.dumps(answers), score)
    )
    conn.commit()
    conn.close()

def get_quiz_submissions(quiz_id: str) -> List[Dict]:
    conn = get_db_connection()
    submissions = conn.execute(
        "SELECT * FROM quiz_submissions WHERE quiz_id = ? ORDER BY submitted_at DESC",
        (quiz_id,)
    ).fetchall()
    conn.close()
    
    results = []
    for s in submissions:
        d = dict(s)
        if d['answers']:
            try:
                d['answers'] = json.loads(d['answers'])
            except:
                d['answers'] = {}
        results.append(d)
    return results

# --- Flashcard Operations ---

def create_flashcard(flashcard_id: str, chatbot_id: str, front: str, back: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO flashcards (id, chatbot_id, front, back) VALUES (?, ?, ?, ?)",
        (flashcard_id, chatbot_id, front, back)
    )
    conn.commit()
    conn.close()

def list_flashcards(chatbot_id: str, published_only: bool = False) -> List[Dict]:
    conn = get_db_connection()
    if published_only:
        flashcards = conn.execute(
            "SELECT * FROM flashcards WHERE chatbot_id = ? AND is_published = 1 ORDER BY created_at DESC",
            (chatbot_id,)
        ).fetchall()
    else:
        flashcards = conn.execute(
            "SELECT * FROM flashcards WHERE chatbot_id = ? ORDER BY created_at DESC",
            (chatbot_id,)
        ).fetchall()
    conn.close()
    return [dict(f) for f in flashcards]

def publish_flashcard(flashcard_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "UPDATE flashcards SET is_published = 1 WHERE id = ?",
        (flashcard_id,)
    )
    conn.commit()
    conn.close()

def delete_flashcard(flashcard_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM flashcards WHERE id = ?", (flashcard_id,))
    conn.commit()
    conn.close()

# --- Lesson Plan Operations ---

def create_lesson_plan(plan_id: str, chatbot_id: str, title: str, topic: str, 
                       content: str, objectives: List[str] = None, 
                       examples: List[str] = None, activities: List[str] = None):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO lesson_plans (id, chatbot_id, title, topic, objectives, content, examples, activities) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (plan_id, chatbot_id, title, topic, 
         json.dumps(objectives) if objectives else None,
         content,
         json.dumps(examples) if examples else None,
         json.dumps(activities) if activities else None)
    )
    conn.commit()
    conn.close()

def list_lesson_plans(chatbot_id: str) -> List[Dict]:
    conn = get_db_connection()
    plans = conn.execute(
        "SELECT * FROM lesson_plans WHERE chatbot_id = ? ORDER BY created_at DESC",
        (chatbot_id,)
    ).fetchall()
    conn.close()
    
    results = []
    for p in plans:
        d = dict(p)
        for field in ['objectives', 'examples', 'activities']:
            if d.get(field):
                try:
                    d[field] = json.loads(d[field])
                except:
                    d[field] = []
        results.append(d)
    return results

def get_lesson_plan(plan_id: str) -> Optional[Dict]:
    conn = get_db_connection()
    plan = conn.execute("SELECT * FROM lesson_plans WHERE id = ?", (plan_id,)).fetchone()
    conn.close()
    
    if plan:
        d = dict(plan)
        for field in ['objectives', 'examples', 'activities']:
            if d.get(field):
                try:
                    d[field] = json.loads(d[field])
                except:
                    d[field] = []
        return d
    return None

def delete_lesson_plan(plan_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM lesson_plans WHERE id = ?", (plan_id,))
    conn.commit()
    conn.close()

# Initialize on import
init_db()
