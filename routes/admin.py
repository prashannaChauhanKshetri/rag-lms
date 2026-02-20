import os
import numpy as np
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Body
from pydantic import BaseModel
from typing import Optional, List, Dict
import database_postgres as db
import vectorstore_postgres as vs
from utils import process_pdf
from models import get_embed_model
import utils_auth
import uuid

# Protect all admin routes
router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(utils_auth.get_current_user)])

# --- Models ---

class TeacherProfileRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    qualifications: Optional[str] = None
    department: Optional[str] = None
    office_location: Optional[str] = None
    office_hours: Optional[str] = None
    years_experience: Optional[int] = None

@router.get("/users")
async def list_users(user=Depends(utils_auth.get_current_user)):
    """List all users (Admin only)"""
    try:
        institution_id = user.get("institution_id")
        users = db.list_users(institution_id)
        return {"users": users}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- TEACHER MANAGEMENT ---

@router.get("/teachers")
async def get_all_teachers(user=Depends(utils_auth.get_current_user)):
    """Get all teachers with detailed profiles"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can view all teachers")
        
        institution_id = user.get("institution_id")
        teachers = db.get_all_teachers(institution_id)
        return {"teachers": teachers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/teachers/{user_id}")
async def get_teacher_details(user_id: str, user=Depends(utils_auth.get_current_user)):
    """Get detailed information for a specific teacher"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can view teacher details")
        
        profile = db.get_teacher_profile(user_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Teacher profile not found")
        
        return {"teacher": profile}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/teachers/{user_id}/profile")
async def update_teacher_profile(user_id: str, request: TeacherProfileRequest, user=Depends(utils_auth.get_current_user)):
    """Update teacher profile information"""
    try:
        if user.get("role") != "admin" and (user.get("sub") or user.get("id")) != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        update_data = {k: v for k, v in request.dict().items() if v is not None}
        if update_data:
            db.update_teacher_profile(user_id, **update_data)
        
        profile = db.get_teacher_profile(user_id)
        return {"message": "Profile updated", "teacher": profile}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/teachers/{user_id}/classes")
async def get_teacher_classes(user_id: str, user=Depends(utils_auth.get_current_user)):
    """Get all classes taught by a teacher"""
    try:
        if user.get("role") != "admin" and (user.get("sub") or user.get("id")) != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        classes = db.list_classes_for_teacher(user_id)
        return {"classes": classes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/teachers/{user_id}/assignments")
async def get_teacher_assignments(user_id: str, user=Depends(utils_auth.get_current_user)):
    """Get all assignments created by a teacher"""
    try:
        if user.get("role") != "admin" and (user.get("sub") or user.get("id")) != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        # Get teacher's classes first
        classes = db.list_classes_for_teacher(user_id)
        all_assignments = []
        
        for cls in classes:
            # Get all subjects (chatbots) for this class
            subjects = db.list_class_subjects(cls["id"])
            for subj in subjects:
                assignments = db.list_assignments_by_chatbot(subj["chatbot_id"])
                all_assignments.extend(assignments)
        
        return {"assignments": all_assignments, "total": len(all_assignments)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# CLASS & SECTION MANAGEMENT (Admin Only)
# ============================================

class AdminCreateClassRequest(BaseModel):
    name: str
    description: Optional[str] = None
    grade_level: Optional[str] = None

class AdminUpdateClassRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    grade_level: Optional[str] = None

class AdminCreateSectionRequest(BaseModel):
    class_id: str
    name: str
    schedule: Optional[Dict] = None

class AdminUpdateSectionRequest(BaseModel):
    name: Optional[str] = None
    schedule: Optional[Dict] = None

class AddSubjectRequest(BaseModel):
    chatbot_id: str

class AssignTeacherRequest(BaseModel):
    teacher_id: str
    section_id: Optional[str] = None

@router.get("/classes")
async def list_all_classes_admin(user=Depends(utils_auth.get_current_user)):
    """List all classes with subject count and section count (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can list all classes")
        
        institution_id = user.get("institution_id")
        classes = db.list_all_classes(institution_id)
        return {"classes": classes}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/classes")
async def create_class_admin(request: AdminCreateClassRequest, user=Depends(utils_auth.get_current_user)):
    """Create a new class (Admin only). Subjects and teachers are added separately."""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can create classes")
        
        institution_id = user.get("institution_id")
        class_id = str(uuid.uuid4())
        db.create_class(class_id, request.name, request.description, request.grade_level, institution_id)
        return {"message": "Class created", "class_id": class_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/classes/{class_id}")
async def get_class_admin(class_id: str, user=Depends(utils_auth.get_current_user)):
    """Get class details with subjects, teachers, and sections (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can view class details")
        
        cls = db.get_class(class_id)
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")
        
        cls["subjects"] = db.list_class_subjects(class_id)
        cls["teacher_assignments"] = db.list_teacher_assignments(class_id)
        cls["sections"] = db.get_sections_by_class(class_id)
        return cls
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/classes/{class_id}")
async def update_class_admin(class_id: str, request: AdminUpdateClassRequest, user=Depends(utils_auth.get_current_user)):
    """Update class details (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can update classes")
        
        cls = db.get_class(class_id)
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")
        
        db.update_class(class_id, name=request.name, description=request.description, grade_level=request.grade_level)
        return {"message": "Class updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/classes/{class_id}")
async def delete_class_admin(class_id: str, user=Depends(utils_auth.get_current_user)):
    """Delete a class (Admin only, cascading deletes subjects, assignments, sections)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can delete classes")
        
        cls = db.get_class(class_id)
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")
        
        db.delete_class(class_id)
        return {"message": "Class deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Class Subjects Management ---

@router.get("/classes/{class_id}/subjects")
async def list_class_subjects_admin(class_id: str, user=Depends(utils_auth.get_current_user)):
    """List all subjects (chatbots) assigned to a class"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        subjects = db.list_class_subjects(class_id)
        return {"subjects": subjects}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/classes/{class_id}/subjects")
async def add_subject_to_class_admin(class_id: str, request: AddSubjectRequest, user=Depends(utils_auth.get_current_user)):
    """Add a chatbot/subject to a class"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        
        cls = db.get_class(class_id)
        if not cls:
            raise HTTPException(status_code=404, detail="Class not found")
        
        cs_id = str(uuid.uuid4())
        db.add_subject_to_class(cs_id, class_id, request.chatbot_id)
        return {"message": "Subject added", "class_subject_id": cs_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/classes/{class_id}/subjects/{cs_id}")
async def remove_subject_from_class_admin(class_id: str, cs_id: str, user=Depends(utils_auth.get_current_user)):
    """Remove a subject from a class (cascading removes teacher assignments)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        db.remove_subject_from_class(cs_id)
        return {"message": "Subject removed"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Teacher Assignments Management ---

@router.get("/classes/{class_id}/teachers")
async def list_teacher_assignments_admin(class_id: str, user=Depends(utils_auth.get_current_user)):
    """List all teacher assignments for a class"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        assignments = db.list_teacher_assignments(class_id)
        return {"assignments": assignments}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/classes/{class_id}/subjects/{cs_id}/teacher")
async def assign_teacher_to_subject_admin(class_id: str, cs_id: str, request: AssignTeacherRequest, user=Depends(utils_auth.get_current_user)):
    """Assign a teacher to a specific subject in this class"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        
        ta_id = str(uuid.uuid4())
        db.assign_teacher_to_subject(ta_id, cs_id, request.teacher_id, request.section_id)
        return {"message": "Teacher assigned", "assignment_id": ta_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/teacher-assignments/{ta_id}")
async def remove_teacher_assignment_admin(ta_id: str, user=Depends(utils_auth.get_current_user)):
    """Remove a teacher assignment"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        db.remove_teacher_assignment(ta_id)
        return {"message": "Teacher assignment removed"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Section Management ---

@router.post("/sections")
async def create_section_admin(request: AdminCreateSectionRequest, user=Depends(utils_auth.get_current_user)):
    """Create a new section under a class (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can create sections")
        
        institution_id = user.get("institution_id")
        section_id = str(uuid.uuid4())
        db.create_section(section_id, request.name, request.class_id, institution_id, request.schedule)
        return {"message": "Section created", "section_id": section_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/sections/{section_id}")
async def update_section_admin(section_id: str, request: AdminUpdateSectionRequest, user=Depends(utils_auth.get_current_user)):
    """Update section details (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can update sections")
        
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        db.update_section(section_id, name=request.name, schedule=request.schedule)
        return {"message": "Section updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/sections/{section_id}")
async def delete_section_admin(section_id: str, user=Depends(utils_auth.get_current_user)):
    """Delete a section (Admin only, soft delete)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can delete sections")
        
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        db.delete_section(section_id)
        return {"message": "Section deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# ENROLLMENT MANAGEMENT (Admin Only)
# ============================================

class EnrollStudentRequest(BaseModel):
    student_id: str

class BulkEnrollRequest(BaseModel):
    student_ids: List[str]

@router.get("/sections/all")
async def list_all_sections_admin(user=Depends(utils_auth.get_current_user)):
    """List all sections across all teachers (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can list all sections")
        
        institution_id = user.get("institution_id")
        sections = db.list_all_sections(institution_id)
        
        # Enrich with student count and teacher info
        for section in sections:
            enrollments = db.list_enrollments(section["id"])
            section["student_count"] = len(enrollments)
        
        return {"sections": sections}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/details")
async def get_section_details_admin(section_id: str, user=Depends(utils_auth.get_current_user)):
    """Get section details with enrolled students (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can view section details")
        
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        enrollments = db.list_enrollments(section_id)
        section["students"] = enrollments
        section["student_count"] = len(enrollments)
        return section
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sections/{section_id}/enroll")
async def enroll_student_admin(section_id: str, request: EnrollStudentRequest, user=Depends(utils_auth.get_current_user)):
    """Enroll a single student in a section (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can enroll students")
        
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        admin_id = user.get("sub") or user.get("id")
        enrollment_id = str(uuid.uuid4())
        db.enroll_student(enrollment_id, section_id, request.student_id, performed_by=admin_id)
        return {"message": "Student enrolled", "enrollment_id": enrollment_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sections/{section_id}/bulk-enroll")
async def bulk_enroll_students_admin(section_id: str, request: BulkEnrollRequest, user=Depends(utils_auth.get_current_user)):
    """Bulk enroll multiple students in a section (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can enroll students")
        
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        if not request.student_ids:
            raise HTTPException(status_code=400, detail="No students provided")
        
        admin_id = user.get("sub") or user.get("id")
        result = db.bulk_enroll_students(section_id, request.student_ids, performed_by=admin_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/sections/{section_id}/students/{student_id}")
async def remove_student_admin(section_id: str, student_id: str, user=Depends(utils_auth.get_current_user)):
    """Remove a student from a section (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can remove students")
        
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        admin_id = user.get("sub") or user.get("id")
        db.remove_enrollment(section_id, student_id, performed_by=admin_id, reason="Removed by admin")
        return {"message": "Student removed from section"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/available-students")
async def get_available_students_admin(section_id: str, search: str = None, user=Depends(utils_auth.get_current_user)):
    """Get students not yet enrolled in a section (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can view available students")
        
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        # Get all students (filtered by institution)
        institution_id = user.get("institution_id")
        all_users = db.list_users(institution_id)
        students = [u for u in all_users if u.get("role") == "student"]
        
        # Get currently enrolled students
        enrollments = db.list_enrollments(section_id)
        enrolled_ids = {e["student_id"] for e in enrollments}
        
        # Filter out already enrolled
        available = [s for s in students if s["id"] not in enrolled_ids]
        
        # Apply search filter if provided
        if search:
            search_lower = search.lower()
            available = [
                s for s in available
                if search_lower in s.get("username", "").lower() or
                   search_lower in s.get("full_name", "").lower() or
                   search_lower in s.get("email", "").lower()
            ]
        
        return [
            {
                "id": s["id"],
                "username": s["username"],
                "full_name": s.get("full_name", s["username"]),
                "email": s.get("email", ""),
            }
            for s in available
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}/enrollment-history")
async def get_enrollment_history_admin(section_id: str, user=Depends(utils_auth.get_current_user)):
    """Get enrollment audit trail for a section (Admin only)"""
    try:
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can view enrollment history")
        
        section = db.get_section(section_id)
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
        
        history = db.get_enrollment_history(section_id=section_id)
        return {"enrollment_history": history}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# COURSE BOT (CHATBOT) MANAGEMENT (Admin Only)
# ============================================

PDF_DIR = "fin_ed_docs"

@router.post("/chatbots")
async def create_chatbot_admin(
    name: str = Form(...),
    greeting: str = Form("Hello! How can I help you?"),
    external_knowledge_ratio: float = Form(0.5),
    user=Depends(utils_auth.get_current_user)
):
    """Create a new course bot (Admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create course bots")
    
    institution_id = user.get("institution_id")
    chatbot_id = str(uuid.uuid4())
    db.create_chatbot(chatbot_id, name, greeting, external_knowledge_ratio, institution_id)
    return {"message": "Course bot created", "id": chatbot_id, "name": name}

@router.get("/chatbots")
async def list_chatbots_admin(user=Depends(utils_auth.get_current_user)):
    """List all course bots (Admin only, filtered by institution via class usage)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can list course bots")
    
    institution_id = user.get("institution_id")
    chatbots = db.list_chatbots(institution_id)
    return {"chatbots": chatbots}

@router.put("/chatbots/{chatbot_id}")
async def update_chatbot_admin(
    chatbot_id: str,
    name: str = Body(None),
    greeting: str = Body(None),
    external_knowledge_ratio: float = Body(None),
    user=Depends(utils_auth.get_current_user)
):
    """Update course bot configuration (Admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update course bots")
    chatbot = db.get_chatbot(chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Course bot not found")
    db.update_chatbot(chatbot_id, name, greeting, external_knowledge_ratio)
    return {"message": "Course bot updated"}

@router.delete("/chatbots/{chatbot_id}")
async def delete_chatbot_admin(chatbot_id: str, user=Depends(utils_auth.get_current_user)):
    """Delete a course bot and all its data (Admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete course bots")
    chatbot = db.get_chatbot(chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Course bot not found")
    db.delete_chatbot(chatbot_id)
    vs.delete_chatbot(chatbot_id)
    return {"message": "Course bot deleted"}

@router.post("/chatbots/{chatbot_id}/upload")
async def upload_document_admin(
    chatbot_id: str,
    file: UploadFile = File(...),
    user=Depends(utils_auth.get_current_user)
):
    """Upload and ingest a PDF for a course bot (Admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can upload documents")
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads supported")
    
    chatbot = db.get_chatbot(chatbot_id)
    if not chatbot:
        raise HTTPException(status_code=404, detail="Course bot not found")
    
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
    res = vs.add_documents(chatbot_id, emb, metadatas)
    
    # Record in DB
    db.add_document(chatbot_id, file.filename, len(texts))
    
    return {
        "message": "Document uploaded and ingested",
        "filename": file.filename,
        "chunks": len(texts),
        "stats": res
    }

@router.get("/chatbots/{chatbot_id}/documents")
async def list_documents_admin(chatbot_id: str, user=Depends(utils_auth.get_current_user)):
    """List documents for a course bot (Admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can list documents")
    docs = db.list_documents(chatbot_id)
    return {"documents": docs}

# ============================================
# DASHBOARD STATS (Admin Only)
# ============================================

@router.get("/dashboard-stats")
async def get_dashboard_stats(user=Depends(utils_auth.get_current_user)):
    """Get dashboard statistics (Admin only)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view dashboard stats")
    try:
        institution_id = user.get("institution_id")
        
        # Filter users by institution
        all_users = db.list_users(institution_id)
        teachers = [u for u in all_users if u.get("role") == "instructor"]
        students = [u for u in all_users if u.get("role") == "student"]
        
        # Filter chatbots by institution (via class usage)
        chatbots = db.list_chatbots(institution_id)
        
        # Filter classes by institution
        classes = db.list_all_classes(institution_id)
        
        return {
            "total_teachers": len(teachers),
            "total_students": len(students),
            "total_course_bots": len(chatbots),
            "total_classes": len(classes),
            "recent_teachers": sorted(teachers, key=lambda x: x.get("created_at", ""), reverse=True)[:5],
            "recent_bots": sorted(chatbots, key=lambda x: x.get("created_at", ""), reverse=True)[:5],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
