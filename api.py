# api.py - UPGRADED for Multi-Chatbot & Hybrid Retrieval
import os
# Set this BEFORE importing tokenizers/transformers
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import logging
import json
import shutil
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import numpy as np

# Load environment variables FIRST
load_dotenv()

# Import local modules
# PostgreSQL Migration - Use new database modules
import database_postgres as db
import vectorstore_postgres as vs

# Original imports commented out for reference
# import database as db
# import vectorstore as vs
from utils import process_pdf, build_system_user_prompt
import ollama # Added for local chat
from vectorstore_postgres import (
    add_documents, 
    hybrid_query, 
    delete_chatbot, 
    get_chatbot_stats, 
    add_feedback_document,
    EMBEDDING_DIM
)

# Global variable for backward compatibility, but we prefer app.state
_EMBED_MODEL = None

def get_embed_model():
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Lazy loading SentenceTransformer (all-MiniLM-L6-v2)...")
        _EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _EMBED_MODEL

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load model on startup
    try:
        app.state.embed_model = get_embed_model()
        logging.info("✓ SentenceTransformer loaded successfully into app.state")
    except Exception as e:
        logging.error(f"Failed to load embedding model: {e}")
    
    yield
    
    # Clean up on shutdown
    app.state.embed_model = None

    # Try to unload models on shutdown (optional)
    # try:
    #     import ollama
    #     ollama.generate(model='phi3:mini', keep_alive=0)
    # except:
    #     pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag-api")

PDF_DIR = "fin_ed_docs"
os.makedirs(PDF_DIR, exist_ok=True)

app = FastAPI(title="RAG-LMS API", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "embedding_model": "all-MiniLM-L6-v2",
        "embedding_dim": EMBEDDING_DIM
    }

# --- Authentication Endpoints ---

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/auth/login")
async def login(request: LoginRequest, response: JSONResponse):
    """Login endpoint"""
    user = db.verify_user(request.username, request.password)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create session token (simple implementation)
    import secrets
    session_token = secrets.token_urlsafe(32)
    
    # In production, store session in Redis or database
    # For now, we'll use a simple in-memory dict
    if not hasattr(app.state, 'sessions'):
        app.state.sessions = {}
    
    app.state.sessions[session_token] = {
        'user_id': user['id'],
        'username': user['username'],
        'role': user['role'],
        'full_name': user['full_name']
    }
    
    response = JSONResponse({
        "message": "Login successful",
        "user": {
            "id": user['id'],
            "username": user['username'],
            "role": user['role'],
            "full_name": user['full_name'],
            "email": user['email']
        },
        "session_token": session_token
    })
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        max_age=86400,  # 24 hours
        samesite="lax"
    )
    
    return response

@app.post("/auth/logout")
async def logout(response: JSONResponse):
    """Logout endpoint"""
    response = JSONResponse({"message": "Logged out successfully"})
    response.delete_cookie("session_token")
    return response

@app.get("/auth/session")
async def get_session(session_token: str = None):
    """Get current session info"""
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if not hasattr(app.state, 'sessions') or session_token not in app.state.sessions:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    return app.state.sessions[session_token]

# --- Admin Endpoints ---

@app.get("/admin/users")
async def list_users(session_token: str = None):
    """List all users (Admin only)"""
    if not session_token or not hasattr(app.state, 'sessions') or session_token not in app.state.sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = app.state.sessions[session_token]
    if session['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
        
    try:
        users = db.list_users()
        return {"users": users}
    except Exception as e:
        logger.error(f"Failed to list users: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Chatbot Management Endpoints ---

@app.post("/chatbots/create")
async def create_chatbot_endpoint(
    name: str = Form(...), 
    greeting: str = Form("Hello! How can I help you?"),
    external_knowledge_ratio: float = Form(0.5)
):
    """Create a new chatbot"""
    import uuid
    chatbot_id = str(uuid.uuid4())
    db.create_chatbot(chatbot_id, name, greeting, external_knowledge_ratio)
    return {"message": "Chatbot created", "id": chatbot_id, "name": name}

@app.get("/chatbots/list")
async def list_chatbots_endpoint():
    """List all chatbots"""
    chatbots = db.list_chatbots()
    return {"chatbots": chatbots}

@app.put("/chatbots/{chatbot_id}")
async def update_chatbot_endpoint(
    chatbot_id: str,
    name: str = Body(None),
    greeting: str = Body(None),
    external_knowledge_ratio: float = Body(None)
):
    """Update chatbot configuration"""
    db.update_chatbot(chatbot_id, name, greeting, external_knowledge_ratio)
    return {"message": "Chatbot updated"}

@app.delete("/chatbots/{chatbot_id}")
async def delete_chatbot_endpoint(chatbot_id: str):
    """Delete a chatbot and its data"""
    db.delete_chatbot(chatbot_id)
    delete_chatbot(chatbot_id)  # Delete vector store
    return {"message": "Chatbot deleted"}

# --- Document Ingestion ---

@app.post("/chatbots/{chatbot_id}/upload")
async def upload_document(chatbot_id: str, file: UploadFile = File(...)):
    """Upload and ingest a PDF for a specific chatbot"""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads supported")
    
    # Check if chatbot exists
    chatbot = db.get_chatbot(chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    contents = await file.read()
    
    # Save file
    safe_filename = os.path.basename(file.filename)
    chatbot_dir = os.path.join(PDF_DIR, chatbot_id)
    os.makedirs(chatbot_dir, exist_ok=True)
    path = os.path.join(chatbot_dir, safe_filename)
    
    with open(path, "wb") as f:
        f.write(contents)
    
    # Process PDF
    try:
        chunks_with_meta = process_pdf(contents)
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF processing error: {e}")
    
    if not chunks_with_meta:
        raise HTTPException(status_code=500, detail="No text extracted from PDF")
    
    # Prepare embeddings
    texts = [c["text"] for c in chunks_with_meta]
    metadatas = []
    for c in chunks_with_meta:
        metadatas.append({
            "text": c["text"],
            "original_text": c.get("original_text", c["text"]),
            "source": file.filename,
            "page": c["page"],
            "chapter": c.get("chapter", "Unknown"),
            "section_type": c.get("section_type", "content"),
            "heading": c.get("heading", "")
        })
    
    try:
        emb = get_embed_model().encode(texts, show_progress_bar=False, convert_to_numpy=True)
        emb = np.asarray(emb).astype("float32")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding error: {e}")
    
    # Add to vectorstore
    res = add_documents(chatbot_id, emb, metadatas)
    
    # Record in DB
    db.add_document(chatbot_id, file.filename, len(texts))
    
    return {
        "message": "Document uploaded and ingested",
        "filename": file.filename,
        "chunks": len(texts),
        "stats": res
    }

@app.get("/chatbots/{chatbot_id}/documents")
async def list_documents_endpoint(chatbot_id: str):
    """List documents for a chatbot"""
    docs = db.list_documents(chatbot_id)
    return {"documents": docs}

# --- Chat & Retrieval ---

class ChatRequest(BaseModel):
    message: str
    top_k: int = 10

@app.post("/chatbots/{chatbot_id}/chat")
async def chat_endpoint(
    chatbot_id: str,
    request: ChatRequest
):
    """Chat with a specific chatbot using hybrid retrieval"""
    chatbot = db.get_chatbot(chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    question = request.message
    top_k = request.top_k
    
    # Embed question
    try:
        q_emb = get_embed_model().encode([question], convert_to_numpy=True).astype("float32")[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding error: {e}")
    
    # Hybrid Retrieval
    hits = hybrid_query(
        chatbot_id, 
        question, 
        q_emb, 
        top_k=top_k,
        bm25_weight=0.3,
        faiss_weight=0.7
    )
    
    if not hits:
        return {"answer": "I couldn't find any relevant information in the documents.", "sources": []}
    
    # Build prompt
    context_docs = []
    for h in hits:
        context_docs.append({
            "source": h.get("source", "unknown"),
            "text": h.get("text", ""),
            "page": h.get("page", "?"),
            "heading": h.get("heading", "")
        })
    
    system_prompt, user_prompt = build_system_user_prompt(context_docs, question)
    
    # Adjust prompt based on external_knowledge_ratio
    ratio = chatbot["external_knowledge_ratio"]
    if ratio < 0.3:
        system_prompt += "\nSTRICTLY answer based ONLY on the provided context. Do not use outside knowledge."
    elif ratio > 0.7:
        system_prompt += "\nYou may use your general knowledge to supplement the answer, but prioritize the context."
    
    # Call LLM
    answer = call_groq_llm(system_prompt, user_prompt)
    
    # Log conversation
    import uuid
    conv_id = str(uuid.uuid4())
    db.log_conversation(conv_id, chatbot_id, question, answer, context_docs)
    
    return {
        "conversation_id": conv_id,
        "response": answer,
        "sources": hits
    }

@app.get("/chatbots/{chatbot_id}/history")
async def get_history_endpoint(chatbot_id: str):
    """Get conversation history"""
    history = db.get_conversations(chatbot_id)
    return {"history": history}

# --- Feedback & Monitoring ---

@app.post("/feedback/submit")
async def submit_feedback_endpoint(
    conversation_id: str = Form(...),
    corrected_answer: str = Form(...)
):
    """Submit instructor feedback/correction"""
    # Get conversation details
    conv = db.get_conversation(conversation_id)
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Log feedback
    db.add_feedback(conversation_id, conv["answer"], corrected_answer)
    
    # Update RAG with correction
    try:
        emb = get_embed_model().encode([corrected_answer], convert_to_numpy=True).astype("float32")[0]
        add_feedback_document(conv["chatbot_id"], conv["question"], corrected_answer, emb)
    except Exception as e:
        logger.error(f"Failed to ingest feedback: {e}")
        # Don't fail the request, just log error
    
    return {"message": "Feedback submitted and RAG updated"}

# --- Helpers ---

def call_groq_llm(system_prompt: str, user_prompt: str) -> str:
    """
    Hybrid Setup:
    - OCR: Local Qwen3-VL-4B (in utils.py)
    - Chat: Cloud Groq (Fast & Free)
    """
    # --- CLOUD MODE (Groq) ---
    return _call_groq_llm_original(system_prompt, user_prompt)

def _call_groq_llm_original(system_prompt: str, user_prompt: str) -> str:
    """Original Groq API Call (Backup)"""
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        return "⚠️ GROQ_API_KEY not configured."
    
    try:
        from groq import Groq
        client = Groq(api_key=groq_api_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=1024
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        return f"Error: {str(e)}"

@app.get("/")
def index():
    return FileResponse("static/login.html")

@app.get("/login.html")
def login_page():
    return FileResponse("static/login.html")

@app.get("/admin.html")
def admin():
    return FileResponse("static/admin.html")

@app.get("/instructor.html")
def instructor():
    return FileResponse("static/instructor.html")

@app.get("/student.html")
def student():
    return FileResponse("static/student.html")

# Serve CSS and JS files
@app.get("/css/{filename}")
def serve_css(filename: str):
    return FileResponse(f"static/css/{filename}")

@app.get("/js/{filename}")
def serve_js(filename: str):
    return FileResponse(f"static/js/{filename}")

# --- Quiz Management Endpoints (Instructor Only) ---

class GenerateQuestionsRequest(BaseModel):
    chatbot_id: str
    topic: str = ""
    count: int = 6
    difficulty: str = "medium"
    types: List[str] = ["mcq", "true_false", "very_short_answer", "short_answer", "long_answer"]

@app.post("/instructor/generate-questions")
async def generate_questions_endpoint(request: GenerateQuestionsRequest):
    """Generate questions using AI (Instructor only)"""
    chatbot = db.get_chatbot(request.chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    # Build prompt that respects ALL question types
    types_str = ", ".join(request.types)
    per_type_count = request.count // len(request.types)
    extra = request.count % len(request.types)

    prompt = f"""
You are an assessment designer. Generate quiz questions in STRICT JSON format only.

Task:
- Generate exactly {request.count} {request.difficulty} difficulty questions
  {f'about "{request.topic}"' if request.topic else "from the course content provided in the context"}.
- Use ALL of these question types: {types_str}.
- Distribute questions as evenly as possible across these types.
  For example, with {request.count} questions and {len(request.types)} types,
  each type should get about {per_type_count} questions, and the remaining {extra} questions
  can be assigned to any of the types.

Question types and their meaning:

1) "mcq"
- Single-best-answer multiple choice question.
- Exactly 4 options.
- JSON fields:
  - "question_text": string
  - "question_type": "mcq"
  - "options": array of 4 strings, in order ["A", "B", "C", "D"]
  - "correct_answer": one of "A", "B", "C", or "D"

2) "true_false"
- Statement that is either true or false.
- JSON fields:
  - "question_text": string
  - "question_type": "true_false"
  - "correct_answer": "True" or "False"

3) "very_short_answer"
- Answer is a single word or a very short phrase.
- JSON fields:
  - "question_text": string
  - "question_type": "very_short_answer"
  - "correct_answer": short string (1-2 words/1 sentence)

4) "short_answer"
- Answer is a few sentences explaining a concept briefly.
- JSON fields:
  - "question_text": string
  - "question_type": "short_answer"
  - "correct_answer": concise explanation (2–4 sentences)

5) "long_answer"
- Answer is a detailed explanation or essay-style response.
- JSON fields:
  - "question_text": string
  - "question_type": "long_answer"
  - "correct_answer": detailed explanation (multiple sentences or a short paragraph)

OUTPUT FORMAT (VERY IMPORTANT):
- Return ONLY valid JSON.
- Do NOT include any prose, comments, markdown, or backticks.
- The top-level object MUST be:
  {{
    "questions": [
      {{
        "question_text": "...",
        "question_type": "...",
        "options": [...],        // only for "mcq"
        "correct_answer": "..."
      }},
      ...
    ]
  }}

- The "questions" array must contain exactly {request.count} items.
- Each item MUST follow the schema for its "question_type".
"""

    try:
        q_emb = get_embed_model().encode([prompt], convert_to_numpy=True).astype("float32")[0]
        
        hits = hybrid_query(
            request.chatbot_id,
            prompt,
            q_emb,
            top_k=10,
            bm25_weight=0.3,
            faiss_weight=0.7
        )
        
        context_docs = []
        for h in hits:
            context_docs.append({
                "source": h.get("source", "unknown"),
                "text": h.get("text", ""),
                "page": h.get("page", "?"),
                "heading": h.get("heading", "")
            })
        
        system_prompt, user_prompt = build_system_user_prompt(context_docs, prompt)
        response_text = call_groq_llm(system_prompt, user_prompt)
        
        # Parse JSON
        import re
        import json
        
        try:
            # Try to find JSON block
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                response_json = json.loads(json_match.group(0))
                questions = response_json.get("questions", [])
            else:
                # Fallback purely for debugging, though we asked for JSON
                questions = []
        except:
            questions = []
            logger.error(f"Failed to parse JSON: {response_text}")

        return {"questions": questions, "raw_text": response_text}
    except Exception as e:
        logger.error(f"Question generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CreateQuizRequest(BaseModel):
    chatbot_id: str
    title: str
    description: str = ""
    questions: List[Dict[str, Any]]

@app.post("/instructor/quizzes/create")
async def create_quiz_endpoint(request: CreateQuizRequest):
    """Create a new quiz with questions (Instructor only)"""
    import uuid
    quiz_id = str(uuid.uuid4())
    
    try:
        db.create_quiz(quiz_id, request.chatbot_id, request.title, request.description)
        
        for idx, q in enumerate(request.questions):
            question_id = str(uuid.uuid4())
            db.add_question(
                question_id,
                quiz_id,
                q["question_text"],
                q["question_type"],
                q["correct_answer"],
                q.get("options"),
                q.get("points", 1),
                idx
            )
        
        return {"message": "Quiz created", "quiz_id": quiz_id}
    except Exception as e:
        logger.error(f"Quiz creation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/instructor/quizzes/{chatbot_id}")
async def list_instructor_quizzes(chatbot_id: str):
    """List all quizzes for a chatbot (Instructor only)"""
    quizzes = db.list_quizzes(chatbot_id, published_only=False)
    
    # Add question count to each quiz
    for quiz in quizzes:
        questions = db.get_quiz_questions(quiz["id"])
        quiz["question_count"] = len(questions)
    
    return {"quizzes": quizzes}

@app.get("/instructor/quizzes/{quiz_id}/details")
async def get_quiz_details(quiz_id: str):
    """Get quiz with all questions (Instructor only)"""
    quiz = db.get_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    questions = db.get_quiz_questions(quiz_id)
    quiz["questions"] = questions
    
    return quiz

@app.post("/instructor/quizzes/{quiz_id}/publish")
async def publish_quiz_endpoint(quiz_id: str):
    """Publish a quiz (Instructor only)"""
    db.publish_quiz(quiz_id)
    return {"message": "Quiz published"}

@app.post("/instructor/quizzes/{quiz_id}/unpublish")
async def unpublish_quiz_endpoint(quiz_id: str):
    """Unpublish a quiz (Instructor only)"""
    db.unpublish_quiz(quiz_id)
    return {"message": "Quiz unpublished"}

@app.delete("/instructor/quizzes/{quiz_id}")
async def delete_quiz_endpoint(quiz_id: str):
    """Delete a quiz (Instructor only)"""
    db.delete_quiz(quiz_id)
    return {"message": "Quiz deleted"}

@app.delete("/instructor/questions/{question_id}")
async def delete_question_endpoint(question_id: str):
    """Delete a question (Instructor only)"""
    db.delete_question(question_id)
    return {"message": "Question deleted"}

# --- Student Quiz Endpoints ---

@app.get("/student/quizzes/{chatbot_id}")
async def list_student_quizzes(chatbot_id: str):
    """List published quizzes for students"""
    quizzes = db.list_quizzes(chatbot_id, published_only=True)
    
    # Add question count but hide answers
    for quiz in quizzes:
        questions = db.get_quiz_questions(quiz["id"])
        quiz["question_count"] = len(questions)
    
    return {"quizzes": quizzes}

@app.get("/student/quizzes/{quiz_id}/take")
async def get_quiz_for_student(quiz_id: str):
    """Get quiz for taking (Student only, no answers)"""
    quiz = db.get_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    if not quiz["is_published"]:
        raise HTTPException(status_code=403, detail="Quiz not published")
    
    questions = db.get_quiz_questions(quiz_id)
    
    # Remove correct answers for students
    for q in questions:
        q.pop("correct_answer", None)
    
    quiz["questions"] = questions
    return quiz

class SubmitQuizRequest(BaseModel):
    quiz_id: str
    student_id: str
    answers: Dict[str, str]  # {question_id: answer}

@app.post("/student/quizzes/submit")
async def submit_quiz_endpoint(request: SubmitQuizRequest):
    """Submit quiz answers and get score"""
    import uuid
    
    quiz = db.get_quiz(request.quiz_id)
    if not quiz or not quiz["is_published"]:
        raise HTTPException(status_code=404, detail="Quiz not found or not published")
    
    questions = db.get_quiz_questions(request.quiz_id)
    
    # Calculate score
    total_points = sum(q["points"] for q in questions)
    earned_points = 0
    
    for q in questions:
        student_answer = request.answers.get(q["id"], "").strip().lower()
        correct_answer = q["correct_answer"].strip().lower()
        
        if q["question_type"] == "mcq":
            if student_answer == correct_answer:
                earned_points += q["points"]
        elif q["question_type"] == "true_false":
            if student_answer == correct_answer:
                earned_points += q["points"]
        else:
            # For short/long answer, simple string match (can be improved)
            if student_answer == correct_answer:
                earned_points += q["points"]
    
    score = (earned_points / total_points * 100) if total_points > 0 else 0
    
    # Save submission
    submission_id = str(uuid.uuid4())
    db.submit_quiz(submission_id, request.quiz_id, request.student_id, request.answers, score)
    
    return {
        "submission_id": submission_id,
        "score": score,
        "earned_points": earned_points,
        "total_points": total_points
    }

@app.get("/instructor/quizzes/{quiz_id}/submissions")
async def get_quiz_submissions_endpoint(quiz_id: str):
    """Get all submissions for a quiz (Instructor only)"""
    submissions = db.get_quiz_submissions(quiz_id)
    return {"submissions": submissions}

# --- Flashcard Endpoints ---

class GenerateFlashcardsRequest(BaseModel):
    chatbot_id: str
    topic: str = ""
    count: int = 10

@app.post("/instructor/flashcards/generate")
async def generate_flashcards_endpoint(request: GenerateFlashcardsRequest):
    """Generate flashcards using AI (Instructor only)"""
    chatbot = db.get_chatbot(request.chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    prompt = f"""Create {request.count} flashcards {f'about "{request.topic}"' if request.topic else 'from the course content'}.
Format: For each flashcard, write "FRONT:" followed by the question/term, then "BACK:" followed by the answer/definition.
Make them clear and educational."""

    try:
        q_emb = get_embed_model().encode([prompt], convert_to_numpy=True).astype("float32")[0]
        hits = hybrid_query(request.chatbot_id, prompt, q_emb, top_k=10)
        
        context_docs = [{"source": h.get("source", ""), "text": h.get("text", ""), "page": h.get("page", "?")} for h in hits]
        system_prompt, user_prompt = build_system_user_prompt(context_docs, prompt)
        response = call_groq_llm(system_prompt, user_prompt)
        
        return {"flashcards": response}
    except Exception as e:
        logger.error(f"Flashcard generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class SaveFlashcardsRequest(BaseModel):
    chatbot_id: str
    flashcards: List[Dict[str, str]]  # [{front: "", back: ""}]

@app.post("/instructor/flashcards/save")
async def save_flashcards_endpoint(request: SaveFlashcardsRequest):
    """Save flashcards (Instructor only)"""
    import uuid
    
    flashcard_ids = []
    for card in request.flashcards:
        flashcard_id = str(uuid.uuid4())
        db.create_flashcard(flashcard_id, request.chatbot_id, card["front"], card["back"])
        db.publish_flashcard(flashcard_id)
        flashcard_ids.append(flashcard_id)
    
    return {"message": f"{len(flashcard_ids)} flashcards saved and published", "ids": flashcard_ids}

@app.get("/instructor/flashcards/{chatbot_id}")
async def list_instructor_flashcards(chatbot_id: str):
    """List all flashcards (Instructor only)"""
    flashcards = db.list_flashcards(chatbot_id, published_only=False)
    return {"flashcards": flashcards}

@app.post("/instructor/flashcards/{flashcard_id}/publish")
async def publish_flashcard_endpoint(flashcard_id: str):
    """Publish a flashcard (Instructor only)"""
    db.publish_flashcard(flashcard_id)
    return {"message": "Flashcard published"}

@app.delete("/instructor/flashcards/{flashcard_id}")
async def delete_flashcard_endpoint(flashcard_id: str):
    """Delete a flashcard (Instructor only)"""
    db.delete_flashcard(flashcard_id)
    return {"message": "Flashcard deleted"}

@app.get("/student/flashcards/{chatbot_id}")
async def list_student_flashcards(chatbot_id: str):
    """List published flashcards (Student only)"""
    flashcards = db.list_flashcards(chatbot_id, published_only=True)
    return {"flashcards": flashcards}

# --- Lesson Plan Endpoints ---

class GenerateLessonPlanRequest(BaseModel):
    chatbot_id: str
    topic: str
    duration: str = "45 minutes"

@app.post("/instructor/lesson-plans/generate")
async def generate_lesson_plan_endpoint(request: GenerateLessonPlanRequest):
    """Generate a lesson plan (Instructor only)"""
    chatbot = db.get_chatbot(request.chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    prompt = f"""Create a detailed lesson plan for teaching "{request.topic}" in {request.duration}.

Include:
1. Learning Objectives (3-5 clear objectives)
2. Introduction (how to start the lesson)
3. Main Content (key concepts to teach with explanations)
4. Teaching Examples (2-3 practical examples)
5. Student Activities (interactive exercises)
6. Assessment Methods (how to check understanding)
7. Conclusion (summary and homework)

Make it practical and engaging for teachers."""

    try:
        q_emb = get_embed_model().encode([prompt], convert_to_numpy=True).astype("float32")[0]
        hits = hybrid_query(request.chatbot_id, prompt, q_emb, top_k=15)
        
        context_docs = [{"source": h.get("source", ""), "text": h.get("text", ""), "page": h.get("page", "?")} for h in hits]
        system_prompt, user_prompt = build_system_user_prompt(context_docs, prompt)
        response = call_groq_llm(system_prompt, user_prompt)
        
        return {"lesson_plan": response}
    except Exception as e:
        logger.error(f"Lesson plan generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class SaveLessonPlanRequest(BaseModel):
    chatbot_id: str
    title: str
    topic: str
    content: str
    objectives: List[str] = []
    examples: List[str] = []
    activities: List[str] = []

@app.post("/instructor/lesson-plans/save")
async def save_lesson_plan_endpoint(request: SaveLessonPlanRequest):
    """Save a lesson plan (Instructor only)"""
    import uuid
    plan_id = str(uuid.uuid4())
    
    db.create_lesson_plan(
        plan_id,
        request.chatbot_id,
        request.title,
        request.topic,
        request.content,
        request.objectives,
        request.examples,
        request.activities
    )
    
    return {"message": "Lesson plan saved", "plan_id": plan_id}

@app.get("/instructor/lesson-plans/{chatbot_id}")
async def list_lesson_plans_endpoint(chatbot_id: str):
    """List all lesson plans (Instructor only)"""
    plans = db.list_lesson_plans(chatbot_id)
    return {"lesson_plans": plans}

@app.get("/instructor/lesson-plans/{plan_id}/details")
async def get_lesson_plan_endpoint(plan_id: str):
    """Get lesson plan details (Instructor only)"""
    plan = db.get_lesson_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")
    return plan

@app.delete("/instructor/lesson-plans/{plan_id}")
async def delete_lesson_plan_endpoint(plan_id: str):
    """Delete a lesson plan (Instructor only)"""
    db.delete_lesson_plan(plan_id)
    return {"message": "Lesson plan deleted"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)