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
    
    conn.commit()
    conn.close()
    logger.info("Database initialized")

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

# Initialize on import
init_db()
