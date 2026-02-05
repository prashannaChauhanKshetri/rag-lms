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
