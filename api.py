# api.py - FIXED VERSION
import os
# Set this BEFORE importing tokenizers/transformers
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import numpy as np

# Load environment variables FIRST
load_dotenv()

# from utils import extract_text_from_pdf_bytes, chunk_text # Removed in upgrade
try:
    from vectorstore import add_documents, EMBEDDING_DIM, query_index
except ImportError as e:
    raise ImportError("The 'vectorstore' module could not be found. Ensure 'vectorstore.py' exists in the same directory as 'api.py'.") from e

# Global variables for models
EMBED_MODEL = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load model on startup
    global EMBED_MODEL
    try:
        from sentence_transformers import SentenceTransformer
        logging.info("Loading SentenceTransformer model...")
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

app = FastAPI(title="RAG Ingest API", lifespan=lifespan)

# Serve frontend from ./static (create directory if it doesn't exist)
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "embedding_model": "all-MiniLM-L6-v2",
        "embedding_dim": EMBEDDING_DIM
    }

@app.post("/ingest")
async def ingest(subject: str = Form(...), file: UploadFile = File(...)):
    """Ingest a PDF file into the vector store for a given subject"""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads supported")
    
    contents = await file.read()
    
    # Save file
    path = os.path.join(PDF_DIR, file.filename)
    with open(path, "wb") as f:
        f.write(contents)
    logger.info(f"Saved PDF: {file.filename}")
    
    # Extract text and chunk with metadata
    try:
        from utils import process_pdf
        chunks_with_meta = process_pdf(contents)
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF processing error: {e}")
    
    if not chunks_with_meta:
        raise HTTPException(status_code=500, detail="No text extracted from PDF")
    
    logger.info(f"Extracted {len(chunks_with_meta)} chunks from {file.filename}")
    
    # Prepare metadata and text list
    texts = [c["text"] for c in chunks_with_meta]
    metadatas = []
    for c in chunks_with_meta:
        metadatas.append({
            "text": c["text"],
            "source": file.filename,
            "page": c["page"]
        })
    
    # Compute embeddings
    try:
        emb = EMBED_MODEL.encode(texts, show_progress_bar=False, convert_to_numpy=True)
        emb = np.asarray(emb).astype("float32")
        logger.info(f"Computed embeddings with shape: {emb.shape}")
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding error: {e}")
    
    if emb.ndim != 2 or emb.shape[1] != EMBEDDING_DIM:
        raise HTTPException(status_code=500, detail=f"Embedding dim mismatch (expected {EMBEDDING_DIM}, got {emb.shape[1]})")
    
    # Add to vectorstore under 'subject' namespace
    try:
        res = add_documents(subject.lower(), emb, metadatas)
        logger.info(f"Added documents to vectorstore: {res}")
    except Exception as e:
        logger.error(f"Vectorstore add error: {e}")
        raise HTTPException(status_code=500, detail=f"Vectorstore add error: {e}")
    
    return {
        "message": "ingested",
        "subject": subject,
        "chunks": len(texts),
        "add_result": res
    }

@app.post("/chat")
async def chat(subject: str = Form(...), question: str = Form(...), top_k: int = Form(4)):
    """Query the vector store and get an answer"""
    logger.info(f"Chat query - Subject: {subject}, Question: {question}")
    
    # Compute embedding for question
    try:
        q_emb = EMBED_MODEL.encode([question], convert_to_numpy=True).astype("float32")[0]
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding error: {e}")
    
    # Fetch hits from vector store
    try:
        hits = query_index(subject.lower(), q_emb, top_k=int(top_k))
    except Exception as e:
        logger.error(f"Query error: {e}")
        raise HTTPException(status_code=500, detail=f"Query error: {e}")
    
    if not hits:
        return {
            "answer": f"No documents found for subject '{subject}'. Please ingest documents first.",
            "sources": []
        }
    
    logger.info(f"Found {len(hits)} relevant chunks")
    
    # Build prompt context
    from utils import build_system_user_prompt
    context_docs = [{"source": h["source"], "text": h["text"], "page": h.get("source_meta", {}).get("page", "?")} for h in hits]
    # Note: vectorstore.query_index returns 'source' and 'text' directly, but 'page' might be inside the original doc metadata.
    # Let's check vectorstore.py query_index implementation.
    # It returns: "text": doc.get("text"), "source": doc.get("source").
    # We need to update vectorstore.py to return all metadata or specifically 'page'.
    
    # Let's fix vectorstore.py first to return full metadata, then come back here.
    # Actually, let's just update this line assuming vectorstore will be fixed.
    context_docs = []
    for h in hits:
        context_docs.append({
            "source": h.get("source", "unknown"),
            "text": h.get("text", ""),
            "page": h.get("page", "?")
        })
    system_prompt, user_prompt = build_system_user_prompt(context_docs, question)
    
    # Call LLM (Groq)
    try:
        answer = call_groq_llm(system_prompt, user_prompt)
    except Exception as e:
        logger.error(f"LLM call error: {e}")
        # Return context without LLM if LLM fails
        answer = "LLM unavailable. Here are the relevant document excerpts:\n\n"
        for i, h in enumerate(hits[:3], 1):
            answer += f"{i}. [{h['source']}]\n{h['text'][:300]}...\n\n"
    
    return {
        "answer": answer,
        "sources": hits
    }

def call_groq_llm(system_prompt: str, user_prompt: str) -> str:
    """Call Groq API to generate answer"""
    groq_api_key = os.getenv("GROQ_API_KEY")
    
    if not groq_api_key:
        logger.warning("GROQ_API_KEY not set. Returning context only.")
        return "⚠️ GROQ_API_KEY not configured. Please set it in your .env file.\n\n" + user_prompt
    
    try:
        from groq import Groq
        client = Groq(api_key=groq_api_key)
        
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.0,
            max_tokens=1024
        )
        
        return response.choices[0].message.content
    
    except ImportError:
        logger.error("groq package not installed. Install: pip install groq")
        return "⚠️ Groq package not installed. Install with: pip install groq"
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        return f"⚠️ Error calling Groq API: {str(e)}"

@app.get("/")
def index():
    """Serve static UI main page"""
    # Check if frontend exists
    html_path = "static/index.html"
    if os.path.exists(html_path):
        return FileResponse(html_path)
        return {
            "message": "RAG API is running",
            "endpoints": {
                "health": "/health",
                "ingest": "/ingest (POST)",
                "chat": "/chat (POST)"
            }
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)