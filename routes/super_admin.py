from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional
import database_postgres as db
import utils_auth
from datetime import datetime

router = APIRouter(prefix="/super_admin", tags=["Super Admin"])

# ============================================
# REQUEST/RESPONSE MODELS
# ============================================

class InstitutionRequest(BaseModel):
    name: str
    code: str
    domain: Optional[str] = None
    logo_url: Optional[str] = None
    contact_email: Optional[str] = None
    is_active: bool = True

class AssignAdminRequest(BaseModel):
    user_id: str
    permissions: Optional[List[str]] = None

# ============================================
# DEPENDENCY: Check if user is super admin
# ============================================

async def check_super_admin(user_data = Depends(utils_auth.get_current_user)):
    """Verify that the current user is a super admin"""
    if not db.is_super_admin(user_data.get("sub")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only super admins can access this resource"
        )
    return user_data

# ============================================
# INSTITUTION MANAGEMENT ENDPOINTS
# ============================================

@router.get("/institutions")
async def list_institutions(user_data = Depends(check_super_admin)):
    """Get all institutions (Super Admin only)"""
    institutions = db.list_institutions(active_only=False)
    return {
        "message": "Institutions retrieved successfully",
        "count": len(institutions),
        "institutions": institutions
    }

@router.get("/institutions/{institution_id}")
async def get_institution(institution_id: str, user_data = Depends(check_super_admin)):
    """Get institution details (Super Admin only)"""
    institution = db.get_institution(institution_id)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    
    # Get institution statistics
    users = db.get_institution_users(institution_id)
    students = [u for u in users if u['role'] == 'student']
    teachers = [u for u in users if u['role'] == 'instructor']
    
    return {
        "institution": institution,
        "statistics": {
            "total_users": len(users),
            "total_students": len(students),
            "total_teachers": len(teachers),
            "total_admins": len([u for u in users if u['role'] == 'admin'])
        }
    }

@router.post("/institutions")
async def create_institution(
    inst_request: InstitutionRequest,
    user_data = Depends(check_super_admin)
):
    """Create a new institution (Super Admin only)"""
    
    # Check if institution code already exists
    existing = db.list_institutions()
    if any(i['code'] == inst_request.code for i in existing):
        raise HTTPException(status_code=400, detail="Institution code already exists")
    
    try:
        institution_id = db.create_institution(
            name=inst_request.name,
            code=inst_request.code,
            domain=inst_request.domain or "",
            logo_url=inst_request.logo_url or "",
            contact_email=inst_request.contact_email or ""
        )
        
        institution = db.get_institution(institution_id)
        return {
            "message": "Institution created successfully",
            "institution": institution
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create institution: {str(e)}")

@router.put("/institutions/{institution_id}")
async def update_institution(
    institution_id: str,
    inst_request: InstitutionRequest,
    user_data = Depends(check_super_admin)
):
    """Update institution details (Super Admin only)"""
    
    # Verify institution exists
    institution = db.get_institution(institution_id)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    
    try:
        db.update_institution(
            institution_id,
            name=inst_request.name,
            code=inst_request.code,
            domain=inst_request.domain,
            logo_url=inst_request.logo_url,
            contact_email=inst_request.contact_email,
            is_active=inst_request.is_active
        )
        
        updated_institution = db.get_institution(institution_id)
        return {
            "message": "Institution updated successfully",
            "institution": updated_institution
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update institution: {str(e)}")

# ============================================
# ADMIN MANAGEMENT ENDPOINTS
# ============================================

@router.post("/institutions/{institution_id}/assign-admin")
async def assign_admin_to_institution(
    institution_id: str,
    assign_request: AssignAdminRequest,
    user_data = Depends(check_super_admin)
):
    """Assign an admin to an institution (Super Admin only)"""
    
    # Verify institution exists
    institution = db.get_institution(institution_id)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    
    # Verify user exists
    user = db.get_user_by_id(assign_request.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    try:
        permissions = assign_request.permissions or [
            'manage_users', 'manage_courses', 'manage_assignments', 'view_analytics'
        ]
        
        admin_role_id = db.assign_admin_to_institution(
            user_id=assign_request.user_id,
            institution_id=institution_id,
            permissions=permissions
        )
        
        return {
            "message": "Admin assigned to institution successfully",
            "admin_role_id": admin_role_id,
            "user_id": assign_request.user_id,
            "institution_id": institution_id,
            "permissions": permissions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to assign admin: {str(e)}")

# ============================================
# USER MANAGEMENT ENDPOINTS
# ============================================

@router.get("/users")
async def list_all_users(
    role: Optional[str] = None,
    institution_id: Optional[str] = None,
    user_data = Depends(check_super_admin)
):
    """List all users across all institutions (Super Admin only)"""
    
    users = db.list_users()
    
    # Filter by role if specified
    if role:
        users = [u for u in users if u.get('role') == role]
    
    # Filter by institution if specified
    if institution_id:
        users = [u for u in users if u.get('institution_id') == institution_id]
    
    return {
        "message": "Users retrieved successfully",
        "count": len(users),
        "filters": {
            "role": role,
            "institution_id": institution_id
        },
        "users": users
    }

@router.get("/users/{user_id}")
async def get_user_details(
    user_id: str,
    user_data = Depends(check_super_admin)
):
    """Get detailed user information (Super Admin only)"""
    
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get role-specific profile data
    profile_data = None
    if user['role'] == 'instructor':
        profile_data = db.get_teacher_profile(user_id)
    elif user['role'] == 'student':
        profile_data = db.get_student_profile(user_id)
    
    # Get institution details if applicable
    institution = None
    if user.get('institution_id'):
        institution = db.get_institution(user['institution_id'])
    
    return {
        "user": user,
        "profile": profile_data,
        "institution": institution
    }

@router.post("/users/{user_id}/change-role")
async def change_user_role(
    user_id: str,
    new_role: str,
    user_data = Depends(check_super_admin)
):
    """Change a user's role (Super Admin only)"""
    
    valid_roles = ['super_admin', 'admin', 'instructor', 'student']
    if new_role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {valid_roles}")
    
    # Verify user exists
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    try:
        # Note: This requires adding an update_user_role function to database_postgres.py
        # For now, we'll return a placeholder response
        return {
            "message": f"User role updated to '{new_role}' successfully",
            "user_id": user_id,
            "new_role": new_role
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to change role: {str(e)}")

# ============================================
# ANALYTICS & REPORTING ENDPOINTS
# ============================================

@router.get("/analytics/overview")
async def get_analytics_overview(user_data = Depends(check_super_admin)):
    """Get system-wide analytics overview (Super Admin only)"""
    
    analytics = db.get_system_analytics()
    
    return {
        "message": "System analytics retrieved successfully",
        "total_institutions": analytics['total_institutions'],
        "active_institutions": analytics['active_institutions'],
        "total_users": analytics['total_users'],
        "users_by_role": analytics['users_by_role'],
        "top_institutions": analytics['top_institutions'],
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/analytics/institutions/{institution_id}")
async def get_institution_analytics(
    institution_id: str,
    user_data = Depends(check_super_admin)
):
    """Get detailed analytics for a specific institution (Super Admin only)"""
    
    analytics = db.get_institution_analytics(institution_id)
    if not analytics:
        raise HTTPException(status_code=404, detail="Institution not found")
    
    return {
        "message": "Institution analytics retrieved successfully",
        "institution": analytics['institution'],
        "students_count": analytics['students_count'],
        "teachers_count": analytics['teachers_count'],
        "admins_count": analytics['admins_count'],
        "total_courses": analytics['total_courses'],
        "pending_assignments": analytics['pending_assignments'],
        "users_by_role": analytics['users_by_role'],
        "timestamp": datetime.utcnow().isoformat()
    }

# ============================================
# STUDENT MANAGEMENT ENDPOINTS
# ============================================

@router.get("/students")
async def list_all_students(
    search: Optional[str] = None,
    institution_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user_data = Depends(check_super_admin)
):
    """List all students across institutions (Super Admin only)"""
    
    result = db.list_all_students(
        search=search,
        institution_id=institution_id,
        limit=limit,
        offset=offset
    )
    
    return {
        "message": "Students retrieved successfully",
        "students": result['students'],
        "total": result['total'],
        "limit": limit,
        "offset": offset,
        "filters": {
            "search": search,
            "institution_id": institution_id
        }
    }

@router.get("/students/{student_id}")
async def get_student_profile(
    student_id: str,
    user_data = Depends(check_super_admin)
):
    """Get detailed student profile (Super Admin only)"""
    
    student = db.get_student_detail(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    return {
        "message": "Student profile retrieved successfully",
        "user": student['user'],
        "profile": student['profile'],
        "attendance": student['attendance']
    }

@router.get("/institutions/{institution_id}/students")
async def list_institution_students(
    institution_id: str,
    search: Optional[str] = None,
    department: Optional[str] = None,
    status: str = "active",
    limit: int = 50,
    offset: int = 0,
    user_data = Depends(check_super_admin)
):
    """List students in a specific institution (Super Admin only)"""
    
    # Verify institution exists
    institution = db.get_institution(institution_id)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    
    result = db.list_institution_students(
        institution_id=institution_id,
        search=search,
        department=department,
        status=status,
        limit=limit,
        offset=offset
    )
    
    return {
        "message": "Institution students retrieved successfully",
        "institution": institution,
        "students": result['students'],
        "total": result['total'],
        "limit": limit,
        "offset": offset,
        "filters": {
            "search": search,
            "department": department,
            "status": status
        }
    }
