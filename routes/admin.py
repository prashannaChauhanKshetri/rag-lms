from fastapi import APIRouter, HTTPException, Request
import database_postgres as db

router = APIRouter(prefix="/admin", tags=["Admin"])

@router.get("/users")
async def list_users(request: Request, session_token: str = None):
    """List all users (Admin only)"""
    if not session_token:
        session_token = request.cookies.get("session_token")
        
    if not session_token or not hasattr(request.app.state, 'sessions') or session_token not in request.app.state.sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = request.app.state.sessions[session_token]
    if session['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
        
    try:
        users = db.list_users()
        return {"users": users}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
