import os
import uuid
import logging
import numpy as np
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Body, Depends, BackgroundTasks
import database_postgres as db
import vectorstore_postgres as vs
from vectorstore_postgres import add_documents, delete_chatbot
from utils import process_pdf
from models import get_embed_model
import utils_auth
import utils_redis as rc

router = APIRouter(prefix="/chatbots", tags=["Chatbots"], dependencies=[Depends(utils_auth.get_current_user)])

PDF_DIR = "fin_ed_docs"
log = logging.getLogger("rag-chat")


def _ingest_pdf_background(doc_id: int, chatbot_id: str, filename: str, file_path: str):
    """Chunk, embed, and index a PDF off the request thread. Updates the
    documents row's status at each stage."""
    try:
        with open(file_path, "rb") as f:
            contents = f.read()

        chunks_with_meta = process_pdf(contents)
        if not chunks_with_meta:
            db.update_document_status(doc_id, "failed", error_message="No text extracted from PDF")
            return

        texts = [c["text"] for c in chunks_with_meta]
        metadatas = [{
            "text": c["text"],
            "original_text": c.get("original_text", c["text"]),
            "source": filename,
            "page": c["page"],
            "chapter": c.get("chapter", "Unknown"),
            "section_type": c.get("section_type", "content"),
            "heading": c.get("heading", "")
        } for c in chunks_with_meta]

        emb = get_embed_model().encode(texts, show_progress_bar=False, convert_to_numpy=True)
        emb = np.asarray(emb).astype("float32")
        add_documents(chatbot_id, emb, metadatas)

        db.update_document_status(doc_id, "ready", chunk_count=len(texts))

        invalidated = rc.cache_delete_pattern(f"rag:{chatbot_id}:*")
        if invalidated:
            log.info(f"Invalidated {invalidated} RAG cache entries for chatbot {chatbot_id}")
        log.info(f"Ingested document {doc_id} ({filename}) with {len(texts)} chunks")
    except Exception as e:
        log.exception(f"Background ingestion failed for doc {doc_id}: {e}")
        db.update_document_status(doc_id, "failed", error_message=str(e)[:500])

# --- Helper: Admin-only guard ---
def _require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage course bots. Use /admin/chatbots endpoints.")

@router.post("/create")
async def create_chatbot_endpoint(
    name: str = Form(...), 
    greeting: str = Form("Hello! How can I help you?"),
    external_knowledge_ratio: float = Form(0.5),
    user=Depends(utils_auth.get_current_user)
):
    """Create a new chatbot (Admin only — prefer /admin/chatbots)"""
    _require_admin(user)
    chatbot_id = str(uuid.uuid4())
    institution_id = user.get("institution_id")
    db.create_chatbot(chatbot_id, name, greeting, external_knowledge_ratio, institution_id)
    return {"message": "Chatbot created", "id": chatbot_id, "name": name}

@router.get("/list")
async def list_chatbots_endpoint(user=Depends(utils_auth.get_current_user)):
    """List all chatbots (filtered by user role)"""
    role = user.get("role")
    
    if role == "student":
        chatbots = db.list_student_chatbots(user.get("sub") or user.get("id"))
    elif role == "instructor":
        chatbots = db.list_instructor_chatbots(user.get("sub") or user.get("id"))
    else:
        # Admin / Super Admin
        chatbots = db.list_chatbots(user.get("institution_id"))
        
    return {"chatbots": chatbots}

@router.put("/{chatbot_id}")
async def update_chatbot_endpoint(
    chatbot_id: str,
    name: str = Body(None),
    greeting: str = Body(None),
    external_knowledge_ratio: float = Body(None),
    user=Depends(utils_auth.get_current_user)
):
    """Update chatbot configuration (Admin only)"""
    _require_admin(user)
    db.update_chatbot(chatbot_id, name, greeting, external_knowledge_ratio)
    return {"message": "Chatbot updated"}

@router.delete("/{chatbot_id}")
async def delete_chatbot_endpoint(chatbot_id: str, user=Depends(utils_auth.get_current_user)):
    """Delete a chatbot and its data (Admin only)"""
    _require_admin(user)
    db.delete_chatbot(chatbot_id)
    delete_chatbot(chatbot_id)
    rc.cache_delete_pattern(f"rag:{chatbot_id}:*")
    return {"message": "Chatbot deleted"}

@router.post("/{chatbot_id}/upload")
async def upload_document(
    chatbot_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user=Depends(utils_auth.get_current_user),
):
    """Upload a PDF; ingestion runs in the background so the request returns
    immediately. Poll /chatbots/{id}/documents to watch status."""
    _require_admin(user)
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads supported")

    chatbot = db.get_chatbot(chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")

    contents = await file.read()
    safe_filename = os.path.basename(file.filename)
    chatbot_dir = os.path.join(PDF_DIR, chatbot_id)
    os.makedirs(chatbot_dir, exist_ok=True)
    path = os.path.join(chatbot_dir, safe_filename)
    with open(path, "wb") as f:
        f.write(contents)

    doc_id = db.add_document(chatbot_id, file.filename, chunk_count=0, status="processing")
    background_tasks.add_task(_ingest_pdf_background, doc_id, chatbot_id, file.filename, path)

    return {
        "message": "Upload accepted; ingestion started",
        "document_id": doc_id,
        "filename": file.filename,
        "status": "processing",
    }

@router.get("/{chatbot_id}/documents")
async def list_documents_endpoint(chatbot_id: str):
    """List documents for a chatbot (accessible to all authenticated users)"""
    docs = db.list_documents(chatbot_id)
    return {"documents": docs}

@router.get("/{chatbot_id}/documents/{doc_id}/status")
async def get_document_status(chatbot_id: str, doc_id: int):
    """Return current ingestion status for a document (for polling)."""
    doc = db.get_document(doc_id)
    if not doc or doc.get("chatbot_id") != chatbot_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "status": doc["status"],
        "chunk_count": doc.get("chunk_count", 0),
        "error_message": doc.get("error_message"),
    }
