from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import database_postgres as db
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
async def list_users():
    """List all users (Admin only)"""
    try:
        users = db.list_users()
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
        
        teachers = db.get_all_teachers()
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
            # Get assignments for each class
            assignments = db.list_assignments(cls["chatbot_id"])
            all_assignments.extend(assignments)
        
        return {"assignments": all_assignments, "total": len(all_assignments)}
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
        
        sections = db.list_all_sections()
        
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
        
        # Get all students
        all_users = db.list_users()
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

