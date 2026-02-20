from typing import List, Dict, Any, Optional
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
async def list_student_quizzes(chatbot_id: str, user=Depends(utils_auth.get_current_user)):
    """List published quizzes for students"""
    # Validate user is authenticated (FIX CRITICAL VULNERABILITY)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    quizzes = db.list_quizzes(chatbot_id, published_only=True)
    for quiz in quizzes:
        questions = db.get_quiz_questions(quiz["id"])
        quiz["question_count"] = len(questions)
    return {"quizzes": quizzes}

@router.get("/quizzes/{quiz_id}/take")
async def get_quiz_for_student(quiz_id: str, user=Depends(utils_auth.get_current_user)):
    """Get quiz for taking (no answers)"""
    # Validate user is authenticated (FIX CRITICAL VULNERABILITY)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
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
async def submit_quiz_endpoint(request: SubmitQuizRequest, user=Depends(utils_auth.get_current_user)):
    """Submit quiz answers and get score"""
    # Validate user is authenticated (FIX CRITICAL VULNERABILITY)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
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
async def list_student_flashcards(chatbot_id: str, user=Depends(utils_auth.get_current_user)):
    """List published flashcards for students"""
    # Validate user is authenticated (FIX CRITICAL VULNERABILITY)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    flashcards = db.list_flashcards(chatbot_id, published_only=True)
    return {"flashcards": flashcards}

@router.get("/assignments/{chatbot_id}")
async def list_student_assignments(chatbot_id: str, user=Depends(utils_auth.get_current_user)):
    """List published assignments for students"""
    # Validate user is authenticated (FIX CRITICAL VULNERABILITY)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    assignments = db.list_assignments_by_chatbot(chatbot_id)
    # Filter only published assignments
    published = [a for a in assignments if a.get('status') == 'published']
    return {"assignments": published}

@router.post("/assignments/submit")
async def submit_assignment_endpoint(
    assignment_id: str = Form(...),
    student_id: str = Form(...),
    student_name: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(utils_auth.get_current_user)
):
    """Submit an assignment with file upload"""
    # Validate user is authenticated (FIX CRITICAL VULNERABILITY)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # File size validation (50MB max)
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: 50MB, submitted: {file_size / 1024 / 1024:.2f}MB"
        )
    
    # Validate file type
    allowed_extensions = {'.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400, 
            detail=f"File type {file_ext} not allowed. Allowed: PDF, DOC, DOCX, TXT, JPG, PNG"
        )
    
    # Validate content-type (basic check)
    allowed_content_types = {
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/jpeg',
        'image/png'
    }
    if file.content_type and file.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content-type: {file.content_type}"
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
async def get_my_submission(
    assignment_id: str, 
    user=Depends(utils_auth.get_current_user)
):
    """Check if student has submitted this assignment"""
    # Extract student_id from JWT token instead of query param (FIX CRITICAL VULNERABILITY)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    student_id = utils_auth.get_user_id(user)
    
    submission = db.get_student_submission(assignment_id, student_id)
    return {"submission": submission}

# ============================================
# COURSE MANAGEMENT: Student Views
# ============================================

@router.get("/sections")
async def list_my_sections(user=Depends(utils_auth.get_current_user)):
    """Get all sections student is enrolled in with enhanced information"""
    try:
        user_id = user.get("id") or user.get("sub")
        if not user_id:
            raise HTTPException(status_code=400, detail="Cannot determine user ID from token")
        
        # Get student's subjects (classes)
        try:
            subjects = db.list_student_subjects(user_id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error fetching subjects: {str(e)}")
        
        # Enrich subjects with attendance and assignment counts
        enriched_subjects = []
        for idx, sub in enumerate(subjects):
            try:
                section_id = sub.get("section_id")
                chatbot_id = sub.get("chatbot_id")
                
                if not section_id or not chatbot_id:
                    continue
                
                # Get attendance percentage (Currently per section, so shared across subjects in same section)
                try:
                    attendance = db.get_student_attendance(section_id, user_id)
                    present_count = sum(1 for a in attendance if a.get("status") == "present")
                    attendance_pct = (present_count / len(attendance) * 100) if attendance else 0
                    sub["attendance_percentage"] = round(attendance_pct, 2)
                except Exception as e:
                    sub["attendance_percentage"] = 0
                    # print(f"Warning: Failed to get attendance for section {section_id}: {str(e)}")
                
                # Get pending assignments (Specific to this subject/chatbot)
                try:
                    # Fetch all assignments for section, then filter by chatbot_id
                    assignments = db.list_assignments_by_section(section_id, published_only=True)
                    subject_assignments = [a for a in assignments if a.get("chatbot_id") == chatbot_id]
                    
                    pending = 0
                    for assignment in subject_assignments:
                        try:
                            submission = db.get_student_submission(assignment.get("id"), user_id)
                            if not submission:
                                pending += 1
                        except Exception:
                            pending += 1
                    sub["pending_assignments"] = pending
                except Exception as e:
                    sub["pending_assignments"] = 0
                    # print(f"Warning: Failed to get assignments for subject {chatbot_id}: {str(e)}")
                
                enriched_subjects.append(sub)
            except Exception as e:
                print(f"Error processing subject at index {idx}: {str(e)}")
                continue
        
        return {"sections": enriched_subjects, "count": len(enriched_subjects)}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Unexpected error: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}")
async def get_section_overview(
    section_id: str, 
    chatbot_id: Optional[str] = None,
    user=Depends(utils_auth.get_current_user)
):
    """Get section overview with assignments, resources, and attendance. Optional chatbot_id filters by subject."""
    try:
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        student_id = utils_auth.get_user_id(user)
        
        # Verify student is enrolled using database function for authorization
        if not db.can_student_access_section(student_id, section_id):
            raise HTTPException(status_code=403, detail="Not enrolled in this section")
        
        # Gather section data
        assignments = db.list_assignments_by_section(section_id, published_only=True)
        
        # Filter assignments if chatbot_id provided
        if chatbot_id:
            assignments = [a for a in assignments if a.get("chatbot_id") == chatbot_id]
            
        resources = db.list_resources(section_id)
        attendance = db.get_student_attendance(section_id, student_id)
        
        # Get teacher info
        teacher = None
        if chatbot_id:
            # Get specific subject teacher
            subject_details = db.get_subject_teacher(section_id, chatbot_id)
            if subject_details:
                # Add subject specific info
                section["subject_name"] = subject_details.get("subject_name")
                
                # Create teacher object from subject details
                if subject_details.get("teacher_name"):
                    teacher = {
                        "full_name": subject_details["teacher_name"],
                        "email": subject_details.get("teacher_email")
                    }
        
        # Default: all teachers for the section if teacher wasn't set by chatbot_id
        if not teacher:
            teachers = db.get_section_teachers(section_id)
            if teachers:
                full_name = ", ".join([t["full_name"] for t in teachers if t.get("full_name")])
                email = teachers[0].get("email") # Use first email for contact
                teacher = {"full_name": full_name, "email": email}
        
        # Calculate attendance percentage
        present_count = sum(1 for a in attendance if a["status"] == "present")
        attendance_percent = (present_count / len(attendance) * 100) if attendance else 0
        
        # Add submission status to assignments
        for assign in assignments:
            submission = db.get_student_submission(assign["id"], student_id)
            assign["submitted"] = submission is not None
            assign["score"] = submission["score"] if submission else None
        
        return {
            "section": section,
            "teacher": teacher,
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
        
        attendance = db.get_student_attendance(section_id, utils_auth.get_user_id(user))
        
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
        
        assignments = db.list_assignments_by_section(section_id, published_only=True)
        
        # Add submission status for student
        for assign in assignments:
            submission = db.get_student_submission(assign["id"], utils_auth.get_user_id(user)) if hasattr(db, 'get_student_submission') else None
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
            # File size validation (50MB max)
            MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
            file.file.seek(0, 2)  # Seek to end
            file_size = file.file.tell()
            file.file.seek(0)  # Reset to beginning
            
            if file_size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size: 50MB, submitted: {file_size / 1024 / 1024:.2f}MB"
                )
            
            # Save uploaded file
            allowed_extensions = {'.pdf', '.doc', '.docx', '.txt', '.docm', '.jpg', '.jpeg', '.png'}
            file_ext = os.path.splitext(file.filename)[1].lower()
            
            if file_ext not in allowed_extensions:
                raise HTTPException(status_code=400, detail=f"File type {file_ext} not allowed")
            
            # Validate content-type
            allowed_content_types = {
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain',
                'image/jpeg',
                'image/png'
            }
            if file.content_type and file.content_type not in allowed_content_types:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid content-type: {file.content_type}"
                )
            
            upload_dir = f"uploads/{section_id}/assignments"
            os.makedirs(upload_dir, exist_ok=True)
            
            safe_filename = f"{assignment_id}_{utils_auth.get_user_id(user)}{file_ext}"
            file_path = f"{upload_dir}/{safe_filename}"
            
            with open(file_path, "wb") as f:
                f.write(await file.read())
        
        submission_id = str(uuid.uuid4())
        db.submit_assignment(submission_id, assignment_id, utils_auth.get_user_id(user), text, file_path)
        
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
        student_id = utils_auth.get_user_id(user)
        
        # Get student's enrollments
        enrollments = db.get_student_enrollments(student_id)
        all_assignments = []
        
        for enrollment in enrollments:
            section_id = enrollment.get("section_id")
            assignments = db.list_assignments_by_section(section_id) if hasattr(db, 'list_assignments_by_section') else []
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
        student_id = utils_auth.get_user_id(user)
        
        # File size validation (50MB max)
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
        file.file.seek(0, 2)  # Seek to end
        file_size = file.file.tell()
        file.file.seek(0)  # Reset to beginning
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum size: 50MB, submitted: {file_size / 1024 / 1024:.2f}MB"
            )
        
        # Validate file extension
        allowed_extensions = {'.pdf', '.doc', '.docx', '.txt', '.docm', '.jpg', '.jpeg', '.png'}
        file_ext = os.path.splitext(file.filename)[1].lower()
        
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"File type {file_ext} not allowed. Allowed: PDF, DOC, DOCX, TXT, JPG, PNG"
            )
        
        # Validate content-type
        allowed_content_types = {
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'image/jpeg',
            'image/png'
        }
        if file.content_type and file.content_type not in allowed_content_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid content-type: {file.content_type}"
            )
        
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

# ============================================
# PHASE 7: STUDENT FEATURES (NEW ENDPOINTS)
# ============================================

@router.get("/assignments/pending")
async def get_pending_assignments(user=Depends(utils_auth.get_current_user)):
    """Get all pending assignments (not yet submitted)"""
    try:
        student_id = user.get("sub") or user.get("id")
        
        # Get all enrolled sections
        enrollments = db.get_student_enrollments(student_id)
        pending = []
        
        for enrollment in enrollments:
            section_id = enrollment.get("section_id")
            assignments = db.list_assignments_by_section(section_id) if hasattr(db, 'list_assignments_by_section') else []
            
            for assign in assignments:
                # Check if student has submitted
                submission = db.get_student_submission(assign["id"], student_id) if hasattr(db, 'get_student_submission') else None
                if not submission:  # Not submitted yet
                    pending.append({
                        "id": assign.get("id"),
                        "title": assign.get("title"),
                        "description": assign.get("description"),
                        "instructions": assign.get("instructions", ""),
                        "section_name": enrollment.get("section_name", ""),
                        "teacher_name": enrollment.get("teacher_name", ""),
                        "due_date": assign.get("due_date"),
                        "submission_deadline": assign.get("submission_deadline", assign.get("due_date")),
                        "max_score": assign.get("max_score", 100),
                        "allow_late_submission": assign.get("allow_late_submission", True)
                    })
        
        return {"assignments": pending}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading pending assignments: {str(e)}")

@router.get("/grades")
async def get_student_grades(user=Depends(utils_auth.get_current_user)):
    """Get all grades and feedback for student"""
    try:
        student_id = user.get("sub") or user.get("id")
        
        # Get all graded submissions
        grades = db.get_student_grades(student_id) if hasattr(db, 'get_student_grades') else []
        
        # Calculate statistics
        if grades:
            total_graded = len(grades)
            percentages = [g.get("percentage", 0) for g in grades]
            average_grade = sum(percentages) / len(percentages) if percentages else 0
            highest_grade = max(percentages) if percentages else 0
            lowest_grade = min(percentages) if percentages else 0
        else:
            total_graded = 0
            average_grade = 0
            highest_grade = 0
            lowest_grade = 0
        
        stats = {
            "total_graded": total_graded,
            "average_grade": round(average_grade, 1),
            "highest_grade": round(highest_grade, 1),
            "lowest_grade": round(lowest_grade, 1)
        }
        
        return {
            "assignments": grades,
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading grades: {str(e)}")

@router.get("/progress")
async def get_student_progress(user=Depends(utils_auth.get_current_user)):
    """Get overall progress analytics"""
    try:
        student_id = user.get("sub") or user.get("id")
        
        # Get enrollments
        enrollments = db.get_student_enrollments(student_id)
        total_courses = len(enrollments)
        
        # Calculate completion metrics
        courses_data = []
        total_assignments = 0
        completed_assignments = 0
        all_grades = []
        
        for enrollment in enrollments:
            section_id = enrollment.get("section_id")
            assignments = db.list_assignments_by_section(section_id) if hasattr(db, 'list_assignments_by_section') else []
            
            section_completed = 0
            section_grades = []
            
            for assign in assignments:
                total_assignments += 1
                submission = db.get_student_submission(assign["id"], student_id) if hasattr(db, 'get_student_submission') else None
                if submission:
                    completed_assignments += 1
                    if submission.get("score"):
                        section_grades.append(submission.get("score"))
                        all_grades.append(submission.get("score"))
                    section_completed += 1
            
            avg_grade = (sum(section_grades) / len(section_grades)) if section_grades else 0
            completion_pct = (section_completed / len(assignments) * 100) if assignments else 0
            
            courses_data.append({
                "course_id": section_id,
                "course_name": enrollment.get("section_name", ""),
                "total_assignments": len(assignments),
                "completed_assignments": section_completed,
                "average_grade": round(avg_grade, 1),
                "completion_percentage": round(completion_pct, 1),
                "last_activity": enrollment.get("last_activity", "")
            })
        
        # Overall metrics
        overall_completion = (completed_assignments / total_assignments * 100) if total_assignments > 0 else 0
        overall_average = (sum(all_grades) / len(all_grades)) if all_grades else 0
        
        return {
            "overall_completion": round(overall_completion, 1),
            "overall_average_grade": round(overall_average, 1),
            "total_courses": total_courses,
            "total_assignments": total_assignments,
            "completed_assignments": completed_assignments,
            "courses": courses_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading progress: {str(e)}")

@router.get("/progress/timeline")
async def get_progress_timeline(
    timeframe: str = Query("month"),
    user=Depends(utils_auth.get_current_user)
):
    """Get progress timeline data for charts"""
    try:
        student_id = user.get("sub") or user.get("id")
        
        # Generate mock timeline data based on timeframe
        # In production, fetch from database
        timeline = []
        
        if timeframe == "week":
            # 7 days of data
            for day in range(1, 8):
                timeline.append({
                    "week": day,
                    "assignments_completed": max(0, (day % 3)),
                    "average_grade": 75 + (day * 2 % 15)
                })
        elif timeframe == "semester":
            # 16 weeks of data
            for week in range(1, 17):
                timeline.append({
                    "week": week,
                    "assignments_completed": max(0, (week % 4)),
                    "average_grade": 70 + (week % 20)
                })
        else:  # month
            # 4 weeks of data
            for week in range(1, 5):
                timeline.append({
                    "week": week,
                    "assignments_completed": max(0, (week % 3) + 1),
                    "average_grade": 72 + (week * 3 % 12)
                })
        
        return {"data": timeline}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading timeline: {str(e)}")

@router.get("/resources")
async def get_course_resources(user=Depends(utils_auth.get_current_user)):
    """Get all resources shared by instructors for enrolled courses"""
    try:
        student_id = user.get("sub") or user.get("id")
        
        # Get enrolled sections
        enrollments = db.get_student_enrollments(student_id)
        all_resources = []
        
        for enrollment in enrollments:
            section_id = enrollment.get("section_id")
            resources = db.list_resources(section_id) if hasattr(db, 'list_resources') else []
            
            for res in resources:
                all_resources.append({
                    "id": res.get("id"),
                    "title": res.get("title"),
                    "description": res.get("description", ""),
                    "type": res.get("type", "document"),  # document, video, link, assignment
                    "url": res.get("url"),
                    "file_path": res.get("file_path"),
                    "uploaded_by": res.get("uploaded_by", ""),
                    "uploaded_date": res.get("uploaded_date", ""),
                    "size": res.get("size"),
                    "course_id": section_id,
                    "course_name": enrollment.get("section_name", "")
                })
        
        return {"resources": all_resources}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading resources: {str(e)}")

@router.get("/stats")
async def get_student_stats(user=Depends(utils_auth.get_current_user)):
    """Get overall student statistics"""
    try:
        student_id = user.get("sub") or user.get("id")
        
        # Get enrollments
        enrollments = db.get_student_enrollments(student_id)
        total_enrollments = len(enrollments)
        
        # Count assignments
        total_assignments = 0
        completed_assignments = 0
        graded_assignments = 0
        total_grade = 0
        
        for enrollment in enrollments:
            section_id = enrollment.get("section_id")
            assignments = db.list_assignments_for_section(section_id) if hasattr(db, 'list_assignments_for_section') else []
            
            for assign in assignments:
                total_assignments += 1
                submission = db.get_student_submission(assign["id"], student_id) if hasattr(db, 'get_student_submission') else None
                if submission:
                    completed_assignments += 1
                    if submission.get("score"):
                        graded_assignments += 1
                        total_grade += submission.get("score")
        
        overall_grade = (total_grade / graded_assignments) if graded_assignments > 0 else 0
        
        return {
            "total_enrollments": total_enrollments,
            "active_assignments": total_assignments - completed_assignments,
            "completed_assignments": completed_assignments,
            "overall_grade": round(overall_grade, 1)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading stats: {str(e)}")