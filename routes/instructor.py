import uuid
import re
import json
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Body, Depends
from pydantic import BaseModel
import database_postgres as db
import vectorstore_postgres as vs
from utils import build_system_user_prompt
import utils_auth
from models import get_embed_model
from routes.chat import call_groq_llm

router = APIRouter(prefix="/instructor", tags=["Instructor"], dependencies=[Depends(utils_auth.get_current_user)])

# --- Models ---

class GenerateQuestionsRequest(BaseModel):
    chatbot_id: str
    topic: str = ""
    count: int = 6
    difficulty: str = "medium"
    types: List[str] = ["mcq", "true_false", "very_short_answer", "short_answer", "long_answer"]

class CreateQuizRequest(BaseModel):
    chatbot_id: str
    title: str
    description: str = ""
    questions: List[Dict[str, Any]]

class GenerateFlashcardsRequest(BaseModel):
    chatbot_id: str
    topic: str = ""
    count: int = 10

class SaveFlashcardsRequest(BaseModel):
    chatbot_id: str
    flashcards: List[Dict[str, str]]

class GenerateLessonPlanRequest(BaseModel):
    chatbot_id: str
    topic: str
    duration: str = "45 minutes"

class SaveLessonPlanRequest(BaseModel):
    chatbot_id: str
    title: str
    topic: str
    content: str
    objectives: List[str] = []
    examples: List[str] = []
    activities: List[str] = []

# --- Endpoints ---

@router.post("/generate-questions")
async def generate_questions_endpoint(request: GenerateQuestionsRequest):
    """Generate questions using AI"""
    chatbot = db.get_chatbot(request.chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
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

... (Prompt content truncated for brevity, same as original api.py) ...
"""
    # Note: I should include the full prompt as in original api.py but let's keep it clean here
    # Since I'm refactoring, I'll copy the actual logic.
    
    # Re-inserting the full prompt from api.py for accuracy
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
  - "correct_answer": concise explanation (2\u20134 sentences)

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
        # SEARCH BY TOPIC/CONTENT - Not the whole instructions prompt
        search_query = request.topic if request.topic else "key concepts and definitions"
        q_emb = get_embed_model().encode([search_query], convert_to_numpy=True).astype("float32")[0]
        hits = vs.hybrid_query(request.chatbot_id, search_query, q_emb, top_k=15)
        
        context_docs = [{"source": h.get("source", ""), "text": h.get("text", ""), "page": h.get("page", "?")} for h in hits]
        system_prompt, user_prompt = build_system_user_prompt(context_docs, prompt)
        response_text = call_groq_llm(system_prompt, user_prompt)
        
        # Parse JSON
        import re
        import json
        import logging
        
        logger = logging.getLogger("instructor-router")
        questions = []
        
        try:
            # 1. Clean the text of obvious markdown junk
            text = response_text.strip()
            
            # Find the FIRST '{' and the LAST '}' to extract the main JSON block
            # This is more robust than re.sub which might fail with text around it
            start_index = text.find('{')
            end_index = text.rfind('}')
            
            if start_index != -1 and end_index != -1 and end_index > start_index:
                json_candidate = text[start_index:end_index+1]
                
                # Cleanup common AI JSON artifacts (trailing commas)
                json_candidate = re.sub(r',(\s*[\]\}])', r'\1', json_candidate)
                
                try:
                    parsed = json.loads(json_candidate)
                    if isinstance(parsed, dict) and "questions" in parsed:
                        questions = parsed["questions"]
                    elif isinstance(parsed, list):
                        questions = parsed
                except json.JSONDecodeError as je:
                    logger.warning(f"Initial JSON parse failed: {je}. Trying secondary cleanup.")
                    # Try to remove any remaining non-JSON chars like comments or trailing prose
                    # (This is a simplified attempt)
                    pass
            
            # 2. Final Fallback: If still empty, try to find individual question objects
            if not questions:
                # Matches { "question_text": "...", ... } style blocks
                segments = re.findall(r'(\{[^{}]*"question_text"[^{}]*\})', text)
                for seg in segments:
                    try:
                        q_obj = json.loads(seg)
                        if "question_text" in q_obj:
                            questions.append(q_obj)
                    except:
                        continue
                        
            if not questions:
                logger.error(f"Failed to extract any questions from response: {response_text[:200]}...")

        except Exception as e:
            logger.error(f"Question parsing exception: {e}")

        return {"questions": questions, "raw_text": response_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/quizzes/create")
async def create_quiz_endpoint(request: CreateQuizRequest):
    """Create a new quiz with questions"""
    quiz_id = str(uuid.uuid4())
    try:
        # Define allowed types in the DB
        ALLOWED_TYPES = {'mcq', 'true_false', 'short_answer', 'long_answer'}
        
        db.create_quiz(quiz_id, request.chatbot_id, request.title, request.description)
        for idx, q in enumerate(request.questions):
            question_id = str(uuid.uuid4())
            
            # Map very_short_answer to short_answer to match DB constraint
            q_type = q["question_type"]
            if q_type == "very_short_answer":
                q_type = "short_answer"
            
            # Ensure it fits the CHECK constraint
            if q_type not in ALLOWED_TYPES:
                q_type = "short_answer"
                
            db.add_question(
                question_id, 
                quiz_id, 
                q["question_text"], 
                q_type, 
                q["correct_answer"], 
                q.get("options"), 
                q.get("points", 1), 
                idx
            )
        return {"message": "Quiz created", "quiz_id": quiz_id}
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/quizzes/{chatbot_id}")
async def list_instructor_quizzes(chatbot_id: str):
    """List all quizzes for a chatbot"""
    quizzes = db.list_quizzes(chatbot_id, published_only=False)
    for quiz in quizzes:
        questions = db.get_quiz_questions(quiz["id"])
        quiz["question_count"] = len(questions)
    return {"quizzes": quizzes}

@router.get("/quizzes/{quiz_id}/details")
async def get_quiz_details(quiz_id: str):
    """Get quiz with all questions"""
    quiz = db.get_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    quiz["questions"] = db.get_quiz_questions(quiz_id)
    return quiz

@router.post("/quizzes/{quiz_id}/publish")
async def publish_quiz_endpoint(quiz_id: str):
    """Publish a quiz"""
    db.publish_quiz(quiz_id)
    return {"message": "Quiz published"}

@router.post("/quizzes/{quiz_id}/unpublish")
async def unpublish_quiz_endpoint(quiz_id: str):
    """Unpublish a quiz"""
    db.unpublish_quiz(quiz_id)
    return {"message": "Quiz unpublished"}

@router.delete("/quizzes/{quiz_id}")
async def delete_quiz_endpoint(quiz_id: str):
    """Delete a quiz"""
    db.delete_quiz(quiz_id)
    return {"message": "Quiz deleted"}

@router.delete("/questions/{question_id}")
async def delete_question_endpoint(question_id: str):
    """Delete a question"""
    db.delete_question(question_id)
    return {"message": "Question deleted"}

@router.get("/quizzes/{quiz_id}/submissions")
async def get_quiz_submissions_endpoint(quiz_id: str):
    """Get all submissions for a quiz"""
    submissions = db.get_quiz_submissions(quiz_id)
    return {"submissions": submissions}

@router.post("/flashcards/generate")
async def generate_flashcards_endpoint(request: GenerateFlashcardsRequest):
    """Generate flashcards using AI"""
    chatbot = db.get_chatbot(request.chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    prompt = f"""Create {request.count} flashcards {f'about "{request.topic}"' if request.topic else 'from the course content'}.
Format: For each flashcard, write "FRONT:" followed by the question/term, then "BACK:" followed by the answer/definition.
Make them clear and educational."""

    try:
        # SEARCH BY TOPIC
        search_query = request.topic if request.topic else "important terms and definitions"
        q_emb = get_embed_model().encode([search_query], convert_to_numpy=True).astype("float32")[0]
        hits = vs.hybrid_query(request.chatbot_id, search_query, q_emb, top_k=15)
        
        context_docs = [{"source": h.get("source", ""), "text": h.get("text", ""), "page": h.get("page", "?")} for h in hits]
        system_prompt, user_prompt = build_system_user_prompt(context_docs, prompt)
        response = call_groq_llm(system_prompt, user_prompt)
        
        # Simple parsing for flashcards
        flashcards = []
        cards = response.split("FRONT:")
        for card in cards[1:]:
            if "BACK:" in card:
                front, back = card.split("BACK:")
                flashcards.append({"front": front.strip(), "back": back.strip()})
        
        return {"flashcards": flashcards}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/flashcards/save")
async def save_flashcards_endpoint(request: SaveFlashcardsRequest):
    """Save flashcards"""
    flashcard_ids = []
    for card in request.flashcards:
        flashcard_id = str(uuid.uuid4())
        db.create_flashcard(flashcard_id, request.chatbot_id, card["front"], card["back"])
        db.publish_flashcard(flashcard_id)
        flashcard_ids.append(flashcard_id)
    return {"message": f"{len(flashcard_ids)} flashcards saved and published", "ids": flashcard_ids}

@router.get("/flashcards/{chatbot_id}")
async def list_instructor_flashcards(chatbot_id: str):
    """List all flashcards"""
    flashcards = db.list_flashcards(chatbot_id, published_only=False)
    return {"flashcards": flashcards}

@router.post("/flashcards/{flashcard_id}/publish")
async def publish_flashcard_endpoint(flashcard_id: str):
    """Publish a flashcard"""
    db.publish_flashcard(flashcard_id)
    return {"message": "Flashcard published"}

@router.delete("/flashcards/{flashcard_id}")
async def delete_flashcard_endpoint(flashcard_id: str):
    """Delete a flashcard"""
    db.delete_flashcard(flashcard_id)
    return {"message": "Flashcard deleted"}

@router.post("/lesson-plans/generate")
async def generate_lesson_plan_endpoint(request: GenerateLessonPlanRequest):
    """Generate a lesson plan using ONLY the provided textbook context"""
    chatbot = db.get_chatbot(request.chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Chatbot not found")
    
    # STRICTOR PROMPT
    prompt = f"""You are an expert teacher assistant. 
TASK: Create a detailed lesson plan for teaching "{request.topic}" in {request.duration} using ONLY the provided context.

STRICT RULES:
1. If the topic "{request.topic}" is NOT discussed in the provided textbook excerpts, you MUST say: "I'm sorry, but I couldn't find information about '{request.topic}' in this textbook. Please choose a topic that is present in the course material."
2. DO NOT use your internal knowledge to teach things not in the book (e.g. do not teach Python if it's a Science book).
3. CITATION: Every concept, objective, or activity MUST include a page reference from the context (e.g., [See Page 45] or "Ref: Page 12").

Include:
- Learning Objectives (with page references)
- Introduction
- Main Content (Detailed points with page references)
- Student Activities
- Assessment (based on textbook content)
"""

    try:
        # SEARCH BY TOPIC
        search_query = request.topic
        q_emb = get_embed_model().encode([search_query], convert_to_numpy=True).astype("float32")[0]
        hits = vs.hybrid_query(request.chatbot_id, search_query, q_emb, top_k=20)
        
        if not hits:
            return {"lesson_plan": f"I couldn't find any documents or content related to '{request.topic}' in this course."}

        context_docs = [{"source": h.get("source", ""), "text": h.get("text", ""), "page": h.get("page", "?")} for h in hits]
        
        # We'll build a custom system prompt for this to be extra strict
        system_prompt = "You are a pedagogical assistant that strictly follows provided textbook material. You NEVER hallucinate content outside the context."
        
        # Use our existing builder but we can override the system prompt for better grounding
        _, user_prompt = build_system_user_prompt(context_docs, prompt)
        
        response = call_groq_llm(system_prompt, user_prompt)
        return {"lesson_plan": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/lesson-plans/save")
async def save_lesson_plan_endpoint(request: SaveLessonPlanRequest):
    """Save a lesson plan"""
    plan_id = str(uuid.uuid4())
    db.create_lesson_plan(plan_id, request.chatbot_id, request.title, request.topic, request.content, request.objectives, request.examples, request.activities)
    return {"message": "Lesson plan saved", "plan_id": plan_id}

@router.get("/lesson-plans/{chatbot_id}")
async def list_lesson_plans_endpoint(chatbot_id: str):
    """List all lesson plans"""
    plans = db.list_lesson_plans(chatbot_id)
    return {"lesson_plans": plans}

@router.get("/lesson-plans/{plan_id}/details")
async def get_lesson_plan_endpoint(plan_id: str):
    """Get lesson plan details"""
    plan = db.get_lesson_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")
    return plan

@router.delete("/lesson-plans/{plan_id}")
async def delete_lesson_plan_endpoint(plan_id: str):
    """Delete a lesson plan"""
    db.delete_lesson_plan(plan_id)
    return {"message": "Lesson plan deleted"}
