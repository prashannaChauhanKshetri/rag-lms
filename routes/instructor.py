import uuid
import re
import json
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Body, Depends
from pydantic import BaseModel
from datetime import datetime
import database_postgres as db
import vectorstore_postgres as vs
from utils import build_system_user_prompt
import utils_auth
from models import get_embed_model
from routes.chat import call_groq_llm

router = APIRouter(prefix="/instructor", tags=["Instructor"], dependencies=[Depends(utils_auth.get_current_user)])

# --- Models ---

# Course Management
class CreateClassRequest(BaseModel):
    chatbot_id: str
    name: str
    description: Optional[str] = None
    grade_level: Optional[str] = None

class UpdateClassRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    grade_level: Optional[str] = None

class CreateSectionRequest(BaseModel):
    chatbot_id: str
    class_id: Optional[str] = None
    name: str
    schedule: Optional[Dict] = None

class UpdateSectionRequest(BaseModel):
    name: Optional[str] = None
    schedule: Optional[Dict] = None
    class_id: Optional[str] = None

class EnrollStudentRequest(BaseModel):
    student_id: str

class BulkEnrollRequest(BaseModel):
    student_ids: List[str]

class BulkEnrollResponse(BaseModel):
    enrolled: List[str]
    skipped: List[Dict[str, str]]
    timestamp: str

class EnrollmentHistoryResponse(BaseModel):
    enrollment_id: str
    section_id: str
    student_id: str
    action: str
    performed_by: str
    reason: Optional[str] = None
    created_at: str

class AttendanceReportRequest(BaseModel):
    start_date: str
    end_date: str

class StudentAttendanceRecord(BaseModel):
    student_id: str
    full_name: str
    email: str
    total_classes: int
    present_count: int
    absent_count: int
    late_count: int
    excused_count: int
    attendance_percentage: float

class AttendanceReportResponse(BaseModel):
    section_id: str
    start_date: str
    end_date: str
    total_classes: int
    student_records: List[StudentAttendanceRecord]

class MarkAttendanceRequest(BaseModel):
    date: str
    students: List[Dict[str, Any]]  # [{student_id, status, notes}]

class CreateAssignmentRequest(BaseModel):
    section_id: str
    title: str
    description: str = ""
    due_date: Optional[str] = None
    points: int = 0

class UpdateAssignmentRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    points: Optional[int] = None

class GradeSubmissionRequest(BaseModel):
    score: float
    feedback: str = ""

class CreateResourceRequest(BaseModel):
    section_id: str
    title: str
    resource_type: str = "document"
    url: Optional[str] = None

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

# --- Assignment Endpoints ---

class CreateAssignmentRequest(BaseModel):
    chatbot_id: str
    title: str
    description: str = ""
    due_date: str  # ISO Format YYYY-MM-DD

@router.post("/assignments/create")
async def create_assignment_endpoint(request: CreateAssignmentRequest):
    """Create a new assignment"""
    assignment_id = str(uuid.uuid4())
    try:
        from datetime import datetime
        # Parse simple date string
        dt = datetime.fromisoformat(request.due_date.replace("Z", "+00:00"))
        db.create_assignment(assignment_id, request.chatbot_id, request.title, request.description, dt)
        return {"message": "Assignment created", "assignment_id": assignment_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assignments/{chatbot_id}")
async def list_assignments_endpoint(chatbot_id: str):
    """List assignments"""
    assigns = db.list_assignments_by_chatbot(chatbot_id)  # FIX: Updated function name
    return {"assignments": assigns}

@router.post("/assignments/{assignment_id}/publish")
async def publish_assignment_endpoint(assignment_id: str):
    """Publish assignment"""
    db.publish_assignment(assignment_id)
    return {"message": "Assignment published"}

@router.delete("/assignments/{assignment_id}")
async def delete_assignment_endpoint(assignment_id: str):
    """Delete assignment"""
    db.delete_assignment(assignment_id)
    return {"message": "Assignment deleted"}

# --- Analytics Endpoints ---

@router.get("/analytics/course/{chatbot_id}")
async def get_course_analytics(chatbot_id: str):
    """Get analytics for a course"""
    # 1. Get Quizzes
    quizzes = db.list_quizzes(chatbot_id)
    total_quizzes = len(quizzes)
    
    # 2. Get Submissions
    total_submissions = 0
    total_score = 0
    all_scores = []
    
    for q in quizzes:
        subs = db.get_quiz_submissions(q['id'])
        total_submissions += len(subs)
        for s in subs:
            total_score += s['score']  # Assuming score is 0-100 or 0-1
            all_scores.append(s['score'])
            
    avg_score = (total_score / total_submissions) if total_submissions > 0 else 0
    
    # 3. Simple Participation (Mock for now, or based on unique student_ids)
    
    return {
        "total_quizzes": total_quizzes,
        "total_submissions": total_submissions,
        "average_score": avg_score,
        "scores_distribution": all_scores
    }

# --- Assignment Grading Endpoints ---

class GradeSubmissionRequest(BaseModel):
    submission_id: str
    grade: float
    feedback: str = ""

@router.get("/assignments/{assignment_id}/submissions")
async def get_assignment_submissions(assignment_id: str):
    """Get all submissions for an assignment"""
    submissions = db.get_assignment_submissions(assignment_id)
    return {"submissions": submissions}

@router.post("/assignments/grade")
async def grade_submission_endpoint(request: GradeSubmissionRequest):
    """Grade a student submission"""
    try:
        db.grade_assignment_submission(request.submission_id, request.grade, request.feedback)
        return {"message": "Submission graded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# COURSE MANAGEMENT: CLASSES (DEPRECATED Write Ops - Moved to Admin)
# ============================================

@router.post("/classes")
async def create_class_deprecated(request: CreateClassRequest, user=Depends(utils_auth.get_current_user)):
    """DEPRECATED: Class management has been moved to Admin role"""
    raise HTTPException(
        status_code=403,
        detail="Class management has been moved to the Admin role. Please contact your administrator to create classes."
    )

@router.get("/classes")
async def list_teacher_classes(user=Depends(utils_auth.get_current_user)):
    """List all classes for logged-in instructor (read-only)"""
    try:
        if user.get("role") != "instructor":
            raise HTTPException(status_code=403, detail="Only instructors can view classes")
        
        classes = db.list_classes_for_teacher((user.get("sub") or (user.get("sub") or user.get("id"))))
        
        # Enrich with section count
        for cls in classes:
            sections = db.get_sections_by_class(cls["id"])
            cls["section_count"] = len(sections) if sections else 0
        
        return {"classes": classes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/classes/{class_id}")
async def get_class(class_id: str, user=Depends(utils_auth.get_current_user)):
    """Get class details with sections (read-only)"""
    try:
        cls = db.get_class(class_id)
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")
        
        # Get sections in this class
        sections = db.get_sections_by_class(class_id)
        cls["sections"] = sections or []
        
        return cls
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/classes/{class_id}")
async def update_class_deprecated(class_id: str, request: UpdateClassRequest, user=Depends(utils_auth.get_current_user)):
    """DEPRECATED: Class management has been moved to Admin role"""
    raise HTTPException(
        status_code=403,
        detail="Class management has been moved to the Admin role. Please contact your administrator to update classes."
    )

@router.delete("/classes/{class_id}")
async def delete_class_deprecated(class_id: str, user=Depends(utils_auth.get_current_user)):
    """DEPRECATED: Class management has been moved to Admin role"""
    raise HTTPException(
        status_code=403,
        detail="Class management has been moved to the Admin role. Please contact your administrator to delete classes."
    )

# ============================================
# COURSE MANAGEMENT: SECTIONS (DEPRECATED Write Ops - Moved to Admin)
# ============================================

@router.post("/sections")
async def create_section_deprecated(request: CreateSectionRequest, user=Depends(utils_auth.get_current_user)):
    """DEPRECATED: Section management has been moved to Admin role"""
    raise HTTPException(
        status_code=403,
        detail="Section management has been moved to the Admin role. Please contact your administrator to create sections."
    )

@router.get("/sections/all")
async def list_all_sections(user=Depends(utils_auth.get_current_user)):
    """List all sections for the current instructor (read-only)"""
    try:
        if user.get("role") != "instructor":
            raise HTTPException(status_code=403, detail="Only instructors can list sections")
        
        sections = db.list_sections_for_teacher((user.get("sub") or user.get("id")))
        
        # Enrich with student count and enrollment data
        for section in sections:
            enrollments = db.list_enrollments(section["id"])
            section["student_count"] = len(enrollments)
            section["students"] = enrollments
        
        return sections
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/details")
async def get_section(section_id: str, user=Depends(utils_auth.get_current_user)):
    """Get section details (read-only)"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        # Check auth: teacher of section or admin
        if user.get("role") == "instructor" and not db.is_teacher_of_section(user.get("sub") or user.get("id"), section_id):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Check institution-level access
        if section.get("institution_id"):
            utils_auth.require_institution(user, section["institution_id"])
        
        enrollments = db.list_enrollments(section_id)
        section["students"] = enrollments
        return section
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/available-students")
async def get_available_students(section_id: str, search: str = None, user=Depends(utils_auth.get_current_user)):
    """Get students not yet enrolled in this section (read-only)"""
    raise HTTPException(
        status_code=403,
        detail="Enrollment management has been moved to the Admin role. Please contact your administrator."
    )

@router.get("/sections/{section_id}/enrollment-history")
async def get_enrollment_history(section_id: str, user=Depends(utils_auth.get_current_user)):
    """Get enrollment audit trail for a section (read-only)"""
    raise HTTPException(
        status_code=403,
        detail="Enrollment history has been moved to the Admin role. Please contact your administrator."
    )

@router.get("/sections/{section_id}/attendance")
async def get_section_attendance(section_id: str, date: Optional[str] = None, user=Depends(utils_auth.get_current_user)):
    """Get attendance records for a section, optionally for a specific date"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), section_id):
            raise HTTPException(status_code=403, detail="Only assigned teachers can view attendance")
        
        # Check institution-level access
        if section.get("institution_id"):
            utils_auth.require_institution(user, section["institution_id"])
        
        # Get all students in section
        enrollments = db.list_enrollments(section_id)
        
        if date:
            # Fetch attendance for the specific date
            attendance_records = db.get_attendance(section_id, date)
            attendance_map = {r["student_id"]: r for r in attendance_records}
            
            # Merge with enrollments
            for student in enrollments:
                if student["student_id"] in attendance_map:
                    record = attendance_map[student["student_id"]]
                    student["status"] = record.get("status")
                    student["notes"] = record.get("notes")
                else:
                    # Default state for students who haven't been marked yet for this date
                    # We can leave it undefined or set a default.
                    # The frontend defaults to 'present' if missing, but maybe we should send null?
                    # Let's send null for status so frontend knows it's not marked.
                    # But wait, frontend logic: 
                    # const rec = attendance.get(student.student_id) || { student_id: student.student_id, status: 'present' as const };
                    # So if we don't send anything, it defaults to present.
                    # If we send 'present', it shows present.
                    # If we send 'absent', it shows absent.
                    pass
                    
        return {"attendance_records": enrollments}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/assignments")
async def list_assignments_for_section(section_id: str, user=Depends(utils_auth.get_current_user)):
    """List assignments for a section"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), section_id):
            raise HTTPException(status_code=403, detail="Only assigned teachers can view assignments")
        
        # Check institution-level access
        if section.get("institution_id"):
            utils_auth.require_institution(user, section["institution_id"])
        
        # Check institution-level access
        if section.get("institution_id"):
            utils_auth.require_institution(user, section["institution_id"])
        
        assignments = db.list_assignments_by_section(section_id)  # FIX: Updated function name
        return {"assignments": assignments}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/resources")
async def list_section_resources(section_id: str, user=Depends(utils_auth.get_current_user)):
    """Get resources for a section"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), section_id):
            raise HTTPException(status_code=403, detail="Only assigned teachers can view resources")
        
        # Check institution-level access
        if section.get("institution_id"):
            utils_auth.require_institution(user, section["institution_id"])
        
        resources = db.get_section_resources(section_id)
        return {"resources": resources}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{chatbot_id}")
async def list_sections(chatbot_id: str, user=Depends(utils_auth.get_current_user)):
    """List sections for a chatbot (read-only)"""
    try:
        if user.get("role") == "instructor":
            sections = db.list_sections_for_teacher((user.get("sub") or (user.get("sub") or user.get("id"))))
        else:
            sections = db.list_sections_for_chatbot(chatbot_id)
        
        # Enrich with student count
        for section in sections:
            enrollments = db.list_enrollments(section["id"])
            section["student_count"] = len(enrollments)
        
        return {"sections": sections}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/sections/{section_id}")
async def update_section_deprecated(section_id: str, request: UpdateSectionRequest, user=Depends(utils_auth.get_current_user)):
    """DEPRECATED: Section management has been moved to Admin role"""
    raise HTTPException(
        status_code=403,
        detail="Section management has been moved to the Admin role. Please contact your administrator to update sections."
    )

@router.delete("/sections/{section_id}")
async def delete_section_deprecated(section_id: str, user=Depends(utils_auth.get_current_user)):
    """DEPRECATED: Section management has been moved to Admin role"""
    raise HTTPException(
        status_code=403,
        detail="Section management has been moved to the Admin role. Please contact your administrator to delete sections."
    )

# ============================================
# ENROLLMENTS (DEPRECATED - Moved to Admin)
# ============================================

@router.post("/sections/{section_id}/enroll")
async def enroll_student_deprecated(section_id: str, request: EnrollStudentRequest, user=Depends(utils_auth.get_current_user)):
    """DEPRECATED: Enrollment management has been moved to Admin role"""
    raise HTTPException(
        status_code=403,
        detail="Enrollment management has been moved to Admin role. Please contact your institution's registrar."
    )

@router.post("/sections/{section_id}/bulk-enroll")
async def bulk_enroll_students_deprecated(section_id: str, request: BulkEnrollRequest, user=Depends(utils_auth.get_current_user)):
    """DEPRECATED: Enrollment management has been moved to Admin role"""
    raise HTTPException(
        status_code=403,
        detail="Enrollment management has been moved to Admin role. Please contact your institution's registrar."
    )

@router.delete("/sections/{section_id}/students/{student_id}")
async def remove_student_deprecated(section_id: str, student_id: str, user=Depends(utils_auth.get_current_user)):
    """DEPRECATED: Enrollment management has been moved to Admin role"""
    raise HTTPException(
        status_code=403,
        detail="Enrollment management has been moved to Admin role. Please contact your institution's registrar."
    )


# ============================================
# ATTENDANCE
# ============================================

@router.post("/sections/{section_id}/attendance")
async def mark_attendance(section_id: str, request: MarkAttendanceRequest, user=Depends(utils_auth.get_current_user)):
    """Mark attendance for multiple students"""
    try:
        logger = logging.getLogger("rag-attendance")
        
        logger.info(f"Marking attendance for section {section_id} on {request.date} with {len(request.students)} students")
        
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), section_id):
            raise HTTPException(status_code=403, detail="Only assigned teachers can mark attendance")
        
        # Check institution-level access
        if section.get("institution_id"):
            utils_auth.require_institution(user, section["institution_id"])
        
        for idx, student_rec in enumerate(request.students):
            try:
                logger.debug(f"Processing student {idx + 1}: {student_rec.get('student_id') if isinstance(student_rec, dict) else 'unknown'}")
                
                attendance_id = str(uuid.uuid4())
                db.mark_attendance(
                    attendance_id,
                    section_id,
                    student_rec["student_id"],
                    request.date,
                    student_rec["status"],
                    (user.get("sub") or user.get("id")),
                    student_rec.get("notes")
                )
            except Exception as e:
                logger.error(f"Error marking attendance for student {student_rec.get('student_id') if isinstance(student_rec, dict) else 'unknown'}: {str(e)}")
                raise
        
        logger.info(f"Attendance marked successfully for {len(request.students)} students in section {section_id}")
        return {"message": f"Attendance marked for {len(request.students)} students"}
    except HTTPException:
        raise
    except Exception as e:
        logger = logging.getLogger("rag-attendance")
        logger.error(f"Error marking attendance: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sections/{section_id}/attendance-report")
async def get_attendance_report_by_range(section_id: str, request: AttendanceReportRequest, user=Depends(utils_auth.get_current_user)):
    """Get attendance report for a section for a date range with statistics"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), section_id):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Check institution-level access
        if section.get("institution_id"):
            utils_auth.require_institution(user, section["institution_id"])
        
        report = db.get_attendance_report(section_id, request.start_date, request.end_date)
        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# ASSIGNMENTS
# ============================================

@router.post("/sections/{section_id}/assignments")
async def create_assignment(section_id: str, request: CreateAssignmentRequest, user=Depends(utils_auth.get_current_user)):
    """Create an assignment"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), section_id):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Check institution-level access
        if section.get("institution_id"):
            utils_auth.require_institution(user, section["institution_id"])
        
        assignment_id = str(uuid.uuid4())
        db.create_assignment(assignment_id, section_id, request.title, request.description, request.due_date, request.points)
        return {"message": "Assignment created", "assignment_id": assignment_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/assignments/{assignment_id}/publish")
async def publish_assignment(assignment_id: str, user=Depends(utils_auth.get_current_user)):
    """Publish an assignment"""
    try:
        assignment = db.get_assignment(assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        section = db.get_section(assignment["section_id"])
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), assignment["section_id"]):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        db.publish_assignment(assignment_id)
        return {"message": "Assignment published"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assignments/{assignment_id}/submissions")
async def get_submissions(assignment_id: str, user=Depends(utils_auth.get_current_user)):
    """Get all submissions for an assignment"""
    try:
        assignment = db.get_assignment(assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        section = db.get_section(assignment["section_id"])
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), assignment["section_id"]):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        submissions = db.list_submissions(assignment_id)
        return {"submissions": submissions}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assignments/{assignment_id}/submissions/summary")
async def get_submissions_summary(assignment_id: str, user=Depends(utils_auth.get_current_user)):
    """Get summary statistics for assignment submissions"""
    try:
        assignment = db.get_assignment(assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        section = db.get_section(assignment["section_id"])
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), assignment["section_id"]):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        summary = db.get_assignment_submissions_summary(assignment_id)
        return summary
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/assignments/{assignment_id}")
async def update_assignment(assignment_id: str, request: UpdateAssignmentRequest, user=Depends(utils_auth.get_current_user)):
    """Update assignment details"""
    try:
        assignment = db.get_assignment(assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        section = db.get_section(assignment["section_id"])
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), assignment["section_id"]):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        db.update_assignment(assignment_id, request.title, request.description, request.due_date, request.points)
        updated = db.get_assignment(assignment_id)
        return {"message": "Assignment updated", "assignment": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/submissions/{submission_id}/grade")
async def grade_submission(submission_id: str, request: GradeSubmissionRequest, user=Depends(utils_auth.get_current_user)):
    """Grade a submission"""
    try:
        submission = db.get_submission(submission_id)
        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        assignment = db.get_assignment(submission["assignment_id"])
        section = db.get_section(assignment["section_id"])
        
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), section_id):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        db.grade_submission(submission_id, request.score, request.feedback)
        return {"message": "Submission graded"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# RESOURCES
# ============================================

@router.post("/sections/{section_id}/resources")
async def create_resource(section_id: str, request: CreateResourceRequest, user=Depends(utils_auth.get_current_user)):
    """Create a resource for a section"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        if not db.is_teacher_of_section(user.get("sub") or user.get("id"), section_id):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Check institution-level access
        if section.get("institution_id"):
            utils_auth.require_institution(user, section["institution_id"])
        
        resource_id = str(uuid.uuid4())
        db.create_resource(resource_id, section_id, request.title, request.resource_type, request.url)
        return {"message": "Resource created", "resource_id": resource_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/resources")
async def list_section_resources(section_id: str):
    """List resources for a section"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        resources = db.list_resources(section_id)
        return {"resources": resources}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str, user=Depends(utils_auth.get_current_user)):
    """Delete a resource"""
    try:
        # Get section from resource (would need to fetch resource first)
        db.delete_resource(resource_id)
        return {"message": "Resource deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
