import os
import uuid
import numpy as np
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Form, Body
from pydantic import BaseModel
import database_postgres as db
import vectorstore_postgres as vs
from utils import build_system_user_prompt
import logging
from models import get_embed_model

logger = logging.getLogger("rag-chat")

router = APIRouter(tags=["Chat"])

class ChatRequest(BaseModel):
    message: str
    top_k: int = 10


# =============================================================================
# NUMPY SANITIZER
# =============================================================================

def _sanitize(obj: Any) -> Any:
    """Recursively convert numpy types to native Python types for JSON serialization."""
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(i) for i in obj]
    return obj


# =============================================================================
# QUERY CLASSIFICATION
# =============================================================================

def _detect_section_type_filter(q_lower: str) -> Optional[str]:
    """
    Detect the most specific section_type hint from a query.

    Checks specific types FIRST (grammar, comprehension, code, etc.)
    before falling back to the generic 'exercise' catch-all.
    Works for all book types: CS, Science, Math, English, Nepali.
    """
    # ── English reading passages (story/poem content) ──
    if any(k in q_lower for k in ["reading passage", "story", "poem", "passage"]):
        return "reading"

    # ── English language-skill sections (most specific — check first) ──
    if any(k in q_lower for k in ["grammar"]):
        return "grammar"
    if any(k in q_lower for k in ["comprehension"]):
        return "comprehension"
    if any(k in q_lower for k in ["vocabulary", "working with words"]):
        return "vocabulary"
    if any(k in q_lower for k in ["critical thinking"]):
        return "critical_thinking"
    if any(k in q_lower for k in ["writing", "essay", "letter writing"]):
        return "writing"
    if any(k in q_lower for k in ["speaking", "dialogue"]):
        return "speaking"
    if any(k in q_lower for k in ["listening"]):
        return "listening"

    # ── CS-specific sections ──
    if any(k in q_lower for k in ["program", "code", "qbasic", "c program", "कार्यक्रम"]):
        return "code_program"
    if any(k in q_lower for k in ["glossary", "technical term", "शब्दावली"]):
        return "glossary"

    # ── Science-specific ──
    if any(k in q_lower for k in ["activity", "lab", "क्रियाकलाप"]):
        return "activity"

    # ── Math-specific ──
    if any(k in q_lower for k in ["example", "worked example", "solved example", "उदाहरण"]):
        return "example"
    if any(k in q_lower for k in ["project work", "project", "परियोजना"]):
        return "project"

    # ── Generic exercise (broadest — checked LAST) ──
    if any(k in q_lower for k in ["exercise", "problem", "question", "अभ्यास"]):
        return "exercise"

    return None


def classify_query(question: str) -> Dict[str, Any]:
    """
    Classify the query type to optimize retrieval strategy.
    Works across all book types: CS, Science, Math, English, Nepali.

    Returns:
        Dict with: query_type, top_k, bm25_weight, faiss_weight,
                    section_type_filter (optional)
    """
    q_lower = question.lower()

    # Structural queries: about book organization
    structural_keywords = [
        "chapter", "unit", "table of contents", "toc", "topics",
        "syllabus", "index", "how many units", "how many chapters",
        "what are the", "list all", "list the", "contents of",
        # Nepali
        "अध्याय", "एकाइ", "विषय सूची", "पाठ",
    ]

    # Exercise/problem queries
    exercise_keywords = [
        "question", "exercise", "problem", "solve", "quiz",
        "practice", "homework", "assignment",
        # English-skill keywords (these are exercise-like)
        "grammar", "comprehension", "vocabulary", "writing",
        "speaking", "listening", "critical thinking",
        # Nepali
        "अभ्यास", "प्रश्न",
    ]

    # Definition queries
    definition_keywords = [
        "what is", "define", "meaning of", "definition",
        "explain", "describe",
        # Nepali
        "परिभाषा", "व्याख्या",
    ]

    section_type_filter = _detect_section_type_filter(q_lower)

    has_exercise_kw = any(k in q_lower for k in exercise_keywords)
    has_structural_kw = any(k in q_lower for k in structural_keywords)
    has_definition_kw = any(k in q_lower for k in definition_keywords)

    # When a specific section type is detected (grammar, comprehension, code, etc.)
    # AND the query also has exercise-like keywords, prefer the exercise path —
    # "grammar exercises from unit 3" is about grammar content, not book structure.
    if section_type_filter and has_exercise_kw:
        return {
            "query_type": "exercise",
            "top_k": 20,
            "bm25_weight": 0.4,
            "faiss_weight": 0.6,
            "fallback_bm25": 0.2,
            "fallback_faiss": 0.8,
            "section_type_filter": section_type_filter,
        }
    elif has_structural_kw and not section_type_filter:
        return {
            "query_type": "structural",
            "top_k": 15,
            "bm25_weight": 0.6,   # Keyword-heavy: TOC chunks match on keywords
            "faiss_weight": 0.4,
            "fallback_bm25": 0.3,
            "fallback_faiss": 0.7,
            "section_type_filter": None,
        }
    elif has_exercise_kw:
        return {
            "query_type": "exercise",
            "top_k": 20,          # Fetch more for exercise listings
            "bm25_weight": 0.4,   # Lean more on vectors — BM25 "exercise" matches too broadly
            "faiss_weight": 0.6,
            "fallback_bm25": 0.2,
            "fallback_faiss": 0.8,
            "section_type_filter": section_type_filter,
        }
    elif has_definition_kw:
        return {
            "query_type": "definition",
            "top_k": 8,           # Definitions are usually concise
            "bm25_weight": 0.3,
            "faiss_weight": 0.7,
            "fallback_bm25": 0.1,
            "fallback_faiss": 0.9,
            "section_type_filter": None,
        }
    else:
        return {
            "query_type": "general",
            "top_k": 10,
            "bm25_weight": 0.4,
            "faiss_weight": 0.6,
            "fallback_bm25": 0.1,
            "fallback_faiss": 0.9,
            "section_type_filter": section_type_filter,
        }


# =============================================================================
# CHAT ENDPOINT
# =============================================================================

@router.post("/chatbots/{chatbot_id}/chat")
async def chat_endpoint(
    chatbot_id: str,
    request: ChatRequest
):
    """Chat with a specific chatbot using hybrid retrieval with query classification"""
    chatbot = db.get_chatbot(chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    question = request.message
    
    # Classify query for optimal retrieval strategy
    query_config = classify_query(question)
    logger.info(f"Query classified as: {query_config['query_type']} | top_k={query_config['top_k']}")
    
    # Use the larger of request.top_k and classified top_k
    final_top_k = max(request.top_k, query_config["top_k"])
    
    # Embed question
    try:
        q_emb = get_embed_model().encode([question], convert_to_numpy=True).astype("float32")[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding error: {e}")
    
    # Primary retrieval with classified weights
    section_filter = query_config.get("section_type_filter")
    hits = vs.hybrid_query(
        chatbot_id,
        question,
        q_emb,
        top_k=final_top_k,
        bm25_weight=query_config["bm25_weight"],
        faiss_weight=query_config["faiss_weight"],
        section_type_filter=section_filter,
    )

    if not hits:
        # Fallback: Relaxed search without section filter
        hits = vs.hybrid_query(
            chatbot_id, question, q_emb, top_k=final_top_k,
            bm25_weight=query_config["fallback_bm25"],
            faiss_weight=query_config["fallback_faiss"]
        )
    
    # Log retrieval metrics
    if hits:
        avg_score = sum(h.get('hybrid_score', 0) for h in hits) / len(hits)
        top_score = hits[0].get('hybrid_score', 0) if hits else 0
        logger.info(
            f"Query: '{question}' | Type: {query_config['query_type']} "
            f"| Hits: {len(hits)} | Top Score: {top_score:.3f} | Avg Score: {avg_score:.3f}"
        )
        
    if not hits:
        return {"answer": "I couldn't find any relevant information in the documents.", "sources": []}
    
    # Build prompt with chapter metadata — with token budget
    # Groq limit: 12K TPM. Budget: ~6K context + ~500 system prompt + 2K response + overhead
    MAX_CONTEXT_TOKENS = 6000
    
    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")
    
    context_docs = []
    total_tokens = 0
    
    # Prioritize TOC chunks first (put them at the front)
    toc_hits = [h for h in hits if h.get('section_type') == 'toc']
    content_hits = [h for h in hits if h.get('section_type') != 'toc']
    ordered_hits = toc_hits + content_hits
    
    for h in ordered_hits:
        text = h.get("text", "")
        text_tokens = len(enc.encode(text))
        
        if total_tokens + text_tokens > MAX_CONTEXT_TOKENS:
            logger.info(f"Context budget reached ({total_tokens} tokens). Skipping remaining {len(hits) - len(context_docs)} hits.")
            break
        
        total_tokens += text_tokens
        context_docs.append({
            "source": h.get("source", "unknown"),
            "text": text,
            "page": h.get("page", "?"),
            "heading": h.get("heading", ""),
            "chapter": h.get("chapter", "")
        })
    
    logger.info(f"Context: {len(context_docs)}/{len(hits)} hits, ~{total_tokens} tokens")
    
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
        "sources": _sanitize(hits)  # sanitize numpy types before JSON serialization
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
        logger.error(f"Failed to add feedback to RAG: {e}")
    
    return {"message": "Feedback submitted and RAG updated"}


# =============================================================================
# LLM HELPER
# =============================================================================

def call_groq_llm(system_prompt: str, user_prompt: str) -> str:
    """Call Groq API with increased token limit for detailed responses"""
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
            max_tokens=2048  # Increased from 1024 for detailed chapter listings
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error: {str(e)}"