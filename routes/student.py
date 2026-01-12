from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, Query
from pydantic import BaseModel
import os
import shutil
import uuid
import database_postgres as db
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

@router.get("/assignments/{chatbot_id}")
async def list_student_assignments(chatbot_id: str):
    """List published assignments for students"""
    assignments = db.list_assignments(chatbot_id)
    # Filter only published assignments
    published = [a for a in assignments if a.get('status') == 'published']
    return {"assignments": published}

@router.post("/assignments/submit")
async def submit_assignment_endpoint(
    assignment_id: str = Form(...),
    student_id: str = Form(...),
    student_name: str = Form(...),
    file: UploadFile = File(...)
):
    """Submit an assignment with file upload"""
    # Validate file type
    allowed_extensions = {'.pdf', '.doc', '.docx', '.txt'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"File type {file_ext} not allowed. Allowed: PDF, DOC, DOCX, TXT"
        )
    
    # Check if already submitted
    existing = db.get_student_submission(assignment_id, student_id)
    if existing:
        raise HTTPException(status_code=400, detail="Assignment already submitted")
    
    # Create submissions directory
    upload_dir = "uploads/assignments"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Generate unique filename
    submission_id = str(uuid.uuid4())
    safe_filename = f"{submission_id}_{file.filename}"
    file_path = os.path.join(upload_dir, safe_filename)
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Save to database
    db.submit_assignment(
        submission_id, 
        assignment_id, 
        student_id, 
        student_name, 
        file_path, 
        file.filename
    )
    
    return {
        "message": "Assignment submitted successfully",
        "submission_id": submission_id
    }

@router.get("/assignments/{assignment_id}/submission")
async def get_my_submission(assignment_id: str, student_id: str = Query(...)):
    """Check if student has submitted this assignment"""
    submission = db.get_student_submission(assignment_id, student_id)
    return {"submission": submission}
