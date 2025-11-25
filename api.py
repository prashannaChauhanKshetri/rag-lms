# api.py - UPGRADED for Multi-Chatbot & Hybrid Retrieval
import os
# Set this BEFORE importing tokenizers/transformers
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import logging
import json
import shutil
from typing import List, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import numpy as np

# Load environment variables FIRST
load_dotenv()

# Import local modules
import database as db
from utils import process_pdf, build_system_user_prompt
from vectorstore import (
    add_documents, 
    hybrid_query, 
    delete_chatbot, 
    get_chatbot_stats, 
    add_feedback_document,
    EMBEDDING_DIM
)

# Global variables
EMBED_MODEL = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load model on startup
    global EMBED_MODEL
    try:
        from sentence_transformers import SentenceTransformer
        logging.info("Loading SentenceTransformer model (jina-embeddings-v2-small-en)...")
        # Using all-MiniLM-L6-v2 for now as per user request, but code supports 512 dim
        EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
        logging.info("✓ SentenceTransformer loaded successfully")
    except Exception as e:
        logging.error(f"Failed to load embedding model: {e}")
    
    yield
    
    # Clean up on shutdown
    EMBED_MODEL = None

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
    chatbot_dir = os.path.join(PDF_DIR, chatbot_id)
    os.makedirs(chatbot_dir, exist_ok=True)
    path = os.path.join(chatbot_dir, file.filename)
    
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
        emb = EMBED_MODEL.encode(texts, show_progress_bar=False, convert_to_numpy=True)
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

@app.post("/chatbots/{chatbot_id}/chat")
async def chat_endpoint(
    chatbot_id: str,
    question: str = Form(...),
    top_k: int = Form(10)
):
    """Chat with a specific chatbot using hybrid retrieval"""
    chatbot = db.get_chatbot(chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    # Embed question
    try:
        q_emb = EMBED_MODEL.encode([question], convert_to_numpy=True).astype("float32")[0]
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
        "answer": answer,
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
    conn = db.get_db_connection()
    conv = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
    conn.close()
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Log feedback
    db.add_feedback(conversation_id, conv["answer"], corrected_answer)
    
    # Update RAG with correction
    try:
        emb = EMBED_MODEL.encode([corrected_answer], convert_to_numpy=True).astype("float32")[0]
        add_feedback_document(conv["chatbot_id"], conv["question"], corrected_answer, emb)
    except Exception as e:
        logger.error(f"Failed to ingest feedback: {e}")
        # Don't fail the request, just log error
    
    return {"message": "Feedback submitted and RAG updated"}

# --- Helpers ---

def call_groq_llm(system_prompt: str, user_prompt: str) -> str:
    """Call Groq API"""
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
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)