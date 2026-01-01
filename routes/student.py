from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import database_postgres as db
import uuid
import utils_auth

router = APIRouter(prefix="/student", tags=["Student"], dependencies=[Depends(utils_auth.get_current_user)])

class SubmitQuizRequest(BaseModel):
    quiz_id: str
    student_id: str
    answers: Dict[str, str]

@router.get("/quizzes/{chatbot_id}")
async def list_student_quizzes(chatbot_id: str):
    """List published quizzes for students"""
    quizzes = db.list_quizzes(chatbot_id, published_only=True)
    for quiz in quizzes:
        questions = db.get_quiz_questions(quiz["id"])
        quiz["question_count"] = len(questions)
    return {"quizzes": quizzes}

@router.get("/quizzes/{quiz_id}/take")
async def get_quiz_for_student(quiz_id: str):
    """Get quiz for taking (no answers)"""
    quiz = db.get_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if not quiz["is_published"]:
        raise HTTPException(status_code=403, detail="Quiz not published")
    
    questions = db.get_quiz_questions(quiz_id)
    for q in questions:
        q.pop("correct_answer", None)
    
    quiz["questions"] = questions
    return quiz

@router.post("/quizzes/submit")
async def submit_quiz_endpoint(request: SubmitQuizRequest):
    """Submit quiz answers and get score"""
    quiz = db.get_quiz(request.quiz_id)
    if not quiz or not quiz["is_published"]:
        raise HTTPException(status_code=404, detail="Quiz not found or not published")
    
    questions = db.get_quiz_questions(request.quiz_id)
    total_points = sum(q["points"] for q in questions)
    earned_points = 0
    
    for q in questions:
        student_answer = request.answers.get(q["id"], "").strip().lower()
        correct_answer = q["correct_answer"].strip().lower()
        
        if student_answer == correct_answer:
            earned_points += q["points"]
    
    score = (earned_points / total_points * 100) if total_points > 0 else 0
    submission_id = str(uuid.uuid4())
    db.submit_quiz(submission_id, request.quiz_id, request.student_id, request.answers, score)
    
    return {
        "submission_id": submission_id,
        "score": score,
        "earned_points": earned_points,
        "total_points": total_points
    }

@router.get("/flashcards/{chatbot_id}")
async def list_student_flashcards(chatbot_id: str):
    """List published flashcards for students"""
    flashcards = db.list_flashcards(chatbot_id, published_only=True)
    return {"flashcards": flashcards}
