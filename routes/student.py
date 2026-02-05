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

# ============================================
# COURSE MANAGEMENT: Student Views
# ============================================

@router.get("/sections")
async def list_my_sections(user=Depends(utils_auth.get_current_user)):
    """Get all sections student is enrolled in"""
    try:
        sections = db.list_student_sections(user["id"])
        return {"sections": sections}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}")
async def get_section_overview(section_id: str, user=Depends(utils_auth.get_current_user)):
    """Get section overview with assignments, resources, and attendance"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        # Verify student is enrolled
        enrollments = db.list_enrollments(section_id)
        enrolled = any(e["student_id"] == user["id"] for e in enrollments)
        if not enrolled:
            raise HTTPException(status_code=403, detail="Not enrolled in this section")
        
        # Gather section data
        assignments = db.list_assignments(section_id, published_only=True)
        resources = db.list_resources(section_id)
        attendance = db.get_student_attendance(section_id, user["id"])
        
        # Calculate attendance percentage
        present_count = sum(1 for a in attendance if a["status"] == "present")
        attendance_percent = (present_count / len(attendance) * 100) if attendance else 0
        
        return {
            "section": section,
            "assignments": assignments,
            "resources": resources,
            "attendance": {
                "records": attendance,
                "total": len(attendance),
                "present": present_count,
                "percentage": round(attendance_percent, 1)
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/attendance")
async def get_my_attendance(section_id: str, user=Depends(utils_auth.get_current_user)):
    """Get personal attendance record for a section"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        attendance = db.get_student_attendance(section_id, user["id"])
        
        # Calculate stats
        total = len(attendance)
        present = sum(1 for a in attendance if a["status"] == "present")
        absent = sum(1 for a in attendance if a["status"] == "absent")
        late = sum(1 for a in attendance if a["status"] == "late")
        excused = sum(1 for a in attendance if a["status"] == "excused")
        
        return {
            "section_id": section_id,
            "records": attendance,
            "stats": {
                "total": total,
                "present": present,
                "absent": absent,
                "late": late,
                "excused": excused,
                "percentage": round((present / total * 100), 1) if total > 0 else 0
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/assignments")
async def get_section_assignments(section_id: str, user=Depends(utils_auth.get_current_user)):
    """Get assignments for a section (student view)"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        assignments = db.list_assignments(section_id, published_only=True)
        
        # Add submission status for student
        for assign in assignments:
            submission = db.get_student_submission(assign["id"], user["id"]) if hasattr(db, 'get_student_submission') else None
            assign["submitted"] = submission is not None
            assign["score"] = submission.get("score") if submission else None
        
        return {"assignments": assignments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sections/{section_id}/assignments/{assignment_id}/submit")
async def submit_assignment(
    section_id: str,
    assignment_id: str,
    text: str = Form(default=""),
    file: UploadFile = File(default=None),
    user=Depends(utils_auth.get_current_user)
):
    """Submit assignment with optional file upload"""
    try:
        assignment = db.get_assignment(assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        file_path = None
        
        if file:
            # Save uploaded file
            allowed_extensions = {'.pdf', '.doc', '.docx', '.txt', '.docm'}
            file_ext = os.path.splitext(file.filename)[1].lower()
            
            if file_ext not in allowed_extensions:
                raise HTTPException(status_code=400, detail=f"File type {file_ext} not allowed")
            
            upload_dir = f"uploads/{section_id}/assignments"
            os.makedirs(upload_dir, exist_ok=True)
            
            safe_filename = f"{assignment_id}_{user['id']}{file_ext}"
            file_path = f"{upload_dir}/{safe_filename}"
            
            with open(file_path, "wb") as f:
                f.write(await file.read())
        
        submission_id = str(uuid.uuid4())
        db.submit_assignment(submission_id, assignment_id, user["id"], text, file_path)
        
        return {"message": "Assignment submitted", "submission_id": submission_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/resources")
async def get_section_resources(section_id: str, user=Depends(utils_auth.get_current_user)):
    """Get resources for a section"""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        resources = db.list_resources(section_id)
        return {"resources": resources}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# --- STUDENT ASSIGNMENT SUBMISSION ---

@router.get("/assignments")
async def list_student_assignments(user=Depends(utils_auth.get_current_user)):
    """Get all assignments for enrolled sections"""
    try:
        student_id = user.get("sub") or user.get("id")
        if not student_id:
            raise HTTPException(status_code=400, detail="Cannot determine user ID")
        
        # Get student's enrollments
        enrollments = db.get_student_enrollments(student_id)
        all_assignments = []
        
        for enrollment in enrollments:
            section_id = enrollment.get("section_id")
            assignments = db.list_assignments_for_section(section_id) if hasattr(db, 'list_assignments_for_section') else []
            for assign in assignments:
                assign["section_id"] = section_id
                all_assignments.append(assign)
        
        return {"assignments": all_assignments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assignments/{assignment_id}")
async def get_assignment_details(assignment_id: str, user=Depends(utils_auth.get_current_user)):
    """Get assignment details"""
    try:
        assignment = db.get_assignment(assignment_id)
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        
        return {"assignment": assignment}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/assignments/{assignment_id}/submit")
async def submit_assignment(
    assignment_id: str,
    file: UploadFile = File(...),
    notes: str = Form(default=""),
    user=Depends(utils_auth.get_current_user)
):
    """Submit assignment with file upload"""
    try:
        student_id = user.get("sub") or user.get("id")
        if not student_id:
            raise HTTPException(status_code=400, detail="Cannot determine user ID")
        
        # Create upload directory if it doesn't exist
        os.makedirs("uploads", exist_ok=True)
        
        # Save the file
        file_ext = os.path.splitext(file.filename)[1]
        file_path = f"uploads/{assignment_id}_{student_id}_{uuid.uuid4()}{file_ext}"
        
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Create submission record
        submission_id = str(uuid.uuid4())
        db.create_assignment_submission(
            submission_id=submission_id,
            assignment_id=assignment_id,
            student_id=student_id,
            file_path=file_path,
            file_name=file.filename,
            notes=notes
        )
        
        return {
            "message": "Assignment submitted successfully",
            "submission_id": submission_id,
            "file_path": file_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/submissions/{submission_id}")
async def get_submission_details(submission_id: str, user=Depends(utils_auth.get_current_user)):
    """Get submission details (grading, feedback)"""
    try:
        submission = db.get_assignment_submission(submission_id)
        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        student_id = user.get("sub") or user.get("id")
        if user.get("role") == "student" and submission["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        return {"submission": submission}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))