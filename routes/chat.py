import os
import uuid
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Form, Body
from pydantic import BaseModel
import database_postgres as db
import vectorstore_postgres as vs
from utils import build_system_user_prompt
from models import get_embed_model

router = APIRouter(tags=["Chat"])

class ChatRequest(BaseModel):
    message: str
    top_k: int = 10

@router.post("/chatbots/{chatbot_id}/chat")
async def chat_endpoint(
    chatbot_id: str,
    request: ChatRequest
):
    """Chat with a specific chatbot using hybrid retrieval"""
    chatbot = db.get_chatbot(chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    question = request.message
    base_top_k = request.top_k
    
    # Smarter Search: Detect if user is asking for "questions" or "exercises"
    is_exercise_query = any(k in question.lower() for k in ["question", "exercise", "problem", "solve", "quiz"])
    
    # Dynamic top_k: Fetch more context if looking for lists of questions
    final_top_k = base_top_k + 10 if is_exercise_query else base_top_k
    
    # Embed question
    try:
        q_emb = get_embed_model().encode([question], convert_to_numpy=True).astype("float32")[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding error: {e}")
    
    # Hybrid Retrieval with dynamic weights
    # If asking for exercises, boost keyword search (BM25) as headers often contain "Exercise"
    bm25_w = 0.5 if is_exercise_query else 0.3
    faiss_w = 0.5 if is_exercise_query else 0.7
    
    hits = vs.hybrid_query(
        chatbot_id, 
        question, 
        q_emb, 
        top_k=final_top_k,
        bm25_weight=bm25_w,
        faiss_weight=faiss_w
    )
    
    if not hits:
        # Fallback: Relaxed search if strict one failed
        hits = vs.hybrid_query(
            chatbot_id, question, q_emb, top_k=final_top_k, 
            bm25_weight=0.1, faiss_weight=0.9 # Rely mostly on semantic vector search
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
    conv_id = str(uuid.uuid4())
    db.log_conversation(conv_id, chatbot_id, question, answer, context_docs)
    
    return {
        "conversation_id": conv_id,
        "response": answer,
        "sources": hits
    }

@router.get("/chatbots/{chatbot_id}/history")
async def get_history_endpoint(chatbot_id: str):
    """Get conversation history"""
    history = db.get_conversations(chatbot_id)
    return {"history": history}

@router.post("/feedback/submit")
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
        vs.add_feedback_document(conv["chatbot_id"], conv["question"], corrected_answer, emb)
    except Exception as e:
        # Don't fail the request, just log error
        pass
    
    return {"message": "Feedback submitted and RAG updated"}

# --- LLM Helper ---
# This is originally in api.py, it's better to keep it accessible

def call_groq_llm(system_prompt: str, user_prompt: str) -> str:
    """Original Groq API Call"""
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        return "\u26a0\ufe0f GROQ_API_KEY not configured."
    
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
        return f"Error: {str(e)}"
