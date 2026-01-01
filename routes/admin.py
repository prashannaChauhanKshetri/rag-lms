from fastapi import APIRouter, HTTPException, Depends
import database_postgres as db
import utils_auth

# Protect all admin routes
router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(utils_auth.get_current_user)])

@router.get("/users")
async def list_users():
    """List all users (Admin only)"""
    # Authentication and authorization (admin role check) are now handled by the router dependency `utils_auth.get_current_user`.
    # If the dependency passes, the user is authenticated and has the necessary admin role.
        
    try:
        users = db.list_users()
        return {"users": users}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
