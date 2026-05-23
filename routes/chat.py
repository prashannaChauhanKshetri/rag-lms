import os
import uuid
import numpy as np
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Form, Depends, Request
from pydantic import BaseModel
import database_postgres as db
import vectorstore_postgres as vs
from utils import build_system_user_prompt, is_structural_query
import utils_auth
import utils_redis as rc
import logging
from models import get_embed_model
from utils_ratelimit import limiter

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
    """
    q_lower = question.lower()

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
    # Use the shared structural check so factual questions like
    # "what is the SI unit of force" don't get routed to chapter-listing.
    has_structural_kw = is_structural_query(question)
    has_definition_kw = any(k in q_lower for k in definition_keywords)

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
            "bm25_weight": 0.6,
            "faiss_weight": 0.4,
            "fallback_bm25": 0.3,
            "fallback_faiss": 0.7,
            "section_type_filter": None,
        }
    elif has_exercise_kw:
        return {
            "query_type": "exercise",
            "top_k": 20,
            "bm25_weight": 0.4,
            "faiss_weight": 0.6,
            "fallback_bm25": 0.2,
            "fallback_faiss": 0.8,
            "section_type_filter": section_type_filter,
        }
    elif has_definition_kw:
        return {
            "query_type": "definition",
            "top_k": 8,
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
@limiter.limit("20/minute;200/day")
async def chat_endpoint(
    request: Request,
    chatbot_id: str,
    body: ChatRequest,
    user: dict = Depends(utils_auth.get_current_user),
):
    """Chat with a specific chatbot using hybrid retrieval with query classification."""
    chatbot = db.get_chatbot(chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")

    question = body.message
    user_id = utils_auth.get_user_id(user)

    # ── 1. RAG Response Cache ─────────────────────────────────────────────────
    # Conversation-independent: same question on same chatbot → same RAG answer.
    # This cache is invalidated when a teacher re-uploads documents.
    rag_cache_key = rc.rag_key(chatbot_id, question)
    cached_response = rc.cache_get(rag_cache_key)
    if cached_response:
        logger.info(f"RAG cache HIT for chatbot={chatbot_id}")
        # Still build conversation memory with cached answer
        rc.conv_append(user_id, chatbot_id, "user", question)
        rc.conv_append(user_id, chatbot_id, "assistant", cached_response["response"])
        # Log to DB
        conv_id = str(uuid.uuid4())
        db.log_conversation(conv_id, chatbot_id, question, cached_response["response"], [])
        return {"conversation_id": conv_id, "cached": True, **cached_response}

    # ── 2. Embedding Cache ────────────────────────────────────────────────────
    e_key = rc.emb_key(question)
    q_emb = rc.emb_get(e_key)
    if q_emb is not None:
        logger.info("Embedding cache HIT")
    else:
        try:
            q_emb = get_embed_model().encode([question], convert_to_numpy=True).astype("float32")[0]
            rc.emb_set(e_key, q_emb)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Embedding error: {e}")

    # ── 3. Classify query & retrieve ─────────────────────────────────────────
    query_config = classify_query(question)
    logger.info(f"Query classified as: {query_config['query_type']} | top_k={query_config['top_k']}")
    final_top_k = max(body.top_k, query_config["top_k"])

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
        hits = vs.hybrid_query(
            chatbot_id, question, q_emb, top_k=final_top_k,
            bm25_weight=query_config["fallback_bm25"],
            faiss_weight=query_config["fallback_faiss"]
        )

    if hits:
        avg_score = sum(h.get('hybrid_score', 0) for h in hits) / len(hits)
        top_score = hits[0].get('hybrid_score', 0)
        logger.info(
            f"Query: '{question}' | Type: {query_config['query_type']} "
            f"| Hits: {len(hits)} | Top: {top_score:.3f} | Avg: {avg_score:.3f}"
        )

    if not hits:
        return {"answer": "I couldn't find any relevant information in the documents.", "sources": []}

    # ── 4. Build context (token budget) ──────────────────────────────────────
    MAX_CONTEXT_TOKENS = 6000
    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")

    context_docs = []
    total_tokens = 0
    toc_hits = [h for h in hits if h.get('section_type') == 'toc']
    content_hits = [h for h in hits if h.get('section_type') != 'toc']

    for h in toc_hits + content_hits:
        text = h.get("text", "")
        text_tokens = len(enc.encode(text))
        if total_tokens + text_tokens > MAX_CONTEXT_TOKENS:
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

    ratio = chatbot["external_knowledge_ratio"]
    if ratio < 0.3:
        system_prompt += "\nSTRICTLY answer based ONLY on the provided context. Do not use outside knowledge."
    elif ratio > 0.7:
        system_prompt += "\nYou may use your general knowledge to supplement the answer, but prioritize the context."

    # ── 5. Conversation memory → Groq messages ───────────────────────────────
    history = rc.conv_get(user_id, chatbot_id)
    if not history:
        # Cold start: load last 6 turns from DB as seed
        try:
            db_history = db.get_user_conversations(user_id, chatbot_id, limit=6)
            for row in reversed(db_history):  # oldest first
                history.append({"role": "user", "content": row["question"]})
                history.append({"role": "assistant", "content": row["answer"]})
        except Exception:
            history = []

    answer = call_groq_llm(system_prompt, user_prompt, history)

    # ── 6. Update conversation memory ────────────────────────────────────────
    rc.conv_append(user_id, chatbot_id, "user", question)
    rc.conv_append(user_id, chatbot_id, "assistant", answer)

    # ── 7. Store RAG response in cache ───────────────────────────────────────
    payload = {
        "response": answer,
        "sources": _sanitize(hits),
    }
    rc.cache_set(rag_cache_key, payload, rc.TTL_RAG_CACHE)

    # ── 8. Log conversation to DB ─────────────────────────────────────────────
    conv_id = str(uuid.uuid4())
    db.log_conversation(conv_id, chatbot_id, question, answer, context_docs, user_id)

    return {"conversation_id": conv_id, "cached": False, **payload}


# =============================================================================
# HISTORY ENDPOINT (student's persistent conversation view)
# =============================================================================

@router.get("/chatbots/{chatbot_id}/history")
async def get_chat_history(
    chatbot_id: str,
    user: dict = Depends(utils_auth.get_current_user),
    limit: int = 50,
    offset: int = 0,
):
    """
    Return the student's full persistent conversation history for a chatbot.
    Loads from PostgreSQL (never expires). Redis only holds the LLM context window.
    """
    user_id = utils_auth.get_user_id(user)
    try:
        rows = db.get_user_conversations(user_id, chatbot_id, limit=limit, offset=offset)
        return {"history": rows, "total": len(rows)}
    except Exception:
        # Fallback: chatbot-level history if per-user query not yet implemented
        rows = db.get_conversations(chatbot_id)
        return {"history": rows, "total": len(rows)}


@router.delete("/chatbots/{chatbot_id}/memory")
async def clear_conversation_memory(
    chatbot_id: str,
    user: dict = Depends(utils_auth.get_current_user),
):
    """Clear the in-memory Redis context for the current student (start a fresh conversation)."""
    user_id = utils_auth.get_user_id(user)
    rc.conv_clear(user_id, chatbot_id)
    return {"message": "Conversation memory cleared. DB history is preserved."}


# =============================================================================
# FEEDBACK ENDPOINT
# =============================================================================

@router.post("/feedback/submit")
async def submit_feedback_endpoint(
    conversation_id: str = Form(...),
    corrected_answer: str = Form(...)
):
    """Submit instructor feedback/correction."""
    conv = db.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.add_feedback(conversation_id, conv["answer"], corrected_answer)

    # Invalidate any RAG cache entry for this question so next student gets fresh answer
    try:
        rc.cache_delete(rc.rag_key(conv["chatbot_id"], conv["question"]))
    except Exception:
        pass

    try:
        emb = get_embed_model().encode([corrected_answer], convert_to_numpy=True).astype("float32")[0]
        vs.add_feedback_document(conv["chatbot_id"], conv["question"], corrected_answer, emb)
    except Exception as e:
        logger.error(f"Failed to add feedback to RAG: {e}")

    return {"message": "Feedback submitted and RAG updated"}


# =============================================================================
# LLM HELPER
# =============================================================================

def call_groq_llm(system_prompt: str, user_prompt: str, history: list = None) -> str:
    """Call Groq API. Includes conversation history for multi-turn context."""
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        return "⚠️ GROQ_API_KEY not configured."

    try:
        from groq import Groq
        client = Groq(api_key=groq_api_key)

        messages = [{"role": "system", "content": system_prompt}]

        # Inject conversation history (last N turns from Redis)
        if history:
            # Guard: cap history tokens so we don't blow the 12K Groq TPM limit
            import tiktoken
            enc = tiktoken.get_encoding("cl100k_base")
            history_tokens = sum(len(enc.encode(m["content"])) for m in history)
            # Drop oldest turns if history > 1500 tokens
            while history_tokens > 1500 and len(history) > 2:
                dropped = history.pop(0)
                history_tokens -= len(enc.encode(dropped["content"]))
            messages.extend(history)

        messages.append({"role": "user", "content": user_prompt})

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.3,
            max_tokens=2048
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error: {str(e)}"
