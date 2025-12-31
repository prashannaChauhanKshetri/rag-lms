import os
import uuid
import numpy as np
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Body, Request
import database_postgres as db
import vectorstore_postgres as vs
from vectorstore_postgres import add_documents, delete_chatbot
from utils import process_pdf
from models import get_embed_model

router = APIRouter(prefix="/chatbots", tags=["Chatbots"])

PDF_DIR = "fin_ed_docs"

@router.post("/create")
async def create_chatbot_endpoint(
    name: str = Form(...), 
    greeting: str = Form("Hello! How can I help you?"),
    external_knowledge_ratio: float = Form(0.5)
):
    """Create a new chatbot"""
    chatbot_id = str(uuid.uuid4())
    db.create_chatbot(chatbot_id, name, greeting, external_knowledge_ratio)
    return {"message": "Chatbot created", "id": chatbot_id, "name": name}

@router.get("/list")
async def list_chatbots_endpoint():
    """List all chatbots"""
    chatbots = db.list_chatbots()
    return {"chatbots": chatbots}

@router.put("/{chatbot_id}")
async def update_chatbot_endpoint(
    chatbot_id: str,
    name: str = Body(None),
    greeting: str = Body(None),
    external_knowledge_ratio: float = Body(None)
):
    """Update chatbot configuration"""
    db.update_chatbot(chatbot_id, name, greeting, external_knowledge_ratio)
    return {"message": "Chatbot updated"}

@router.delete("/{chatbot_id}")
async def delete_chatbot_endpoint(chatbot_id: str):
    """Delete a chatbot and its data"""
    db.delete_chatbot(chatbot_id)
    delete_chatbot(chatbot_id)  # Delete vector store
    return {"message": "Chatbot deleted"}

@router.post("/{chatbot_id}/upload")
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

@router.get("/{chatbot_id}/documents")
async def list_documents_endpoint(chatbot_id: str):
    """List documents for a chatbot"""
    docs = db.list_documents(chatbot_id)
    return {"documents": docs}
