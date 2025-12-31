from fastapi import APIRouter, HTTPException, Body, Response, Request, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import secrets
import database_postgres as db

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(request: Request, login_data: LoginRequest, response: JSONResponse):
    """Login endpoint"""
    user = db.verify_user(login_data.username, login_data.password)
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create session token
    session_token = secrets.token_urlsafe(32)
    
    # Access app state from request
    if not hasattr(request.app.state, 'sessions'):
        request.app.state.sessions = {}
    
    request.app.state.sessions[session_token] = {
        'user_id': user['id'],
        'username': user['username'],
        'role': user['role'],
        'full_name': user['full_name']
    }
    
    res_data = {
        "message": "Login successful",
        "user": {
            "id": user['id'],
            "username": user['username'],
            "role": user['role'],
            "full_name": user['full_name'],
            "email": user['email']
        },
        "session_token": session_token
    }
    
    # Note: JSONResponse might be tricky here because we want to set a cookie
    # We can return the data and set the cookie in the response object
    # But the student's code used response: JSONResponse as a parameter (which is unusual for FastAPI)
    # Usually it's response: Response
    
    result = JSONResponse(content=res_data)
    result.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        max_age=86400,  # 24 hours
        samesite="lax"
    )
    
    return result

@router.post("/logout")
async def logout():
    """Logout endpoint"""
    response = JSONResponse({"message": "Logged out successfully"})
    response.delete_cookie("session_token")
    return response

@router.get("/session")
async def get_session(request: Request, session_token: str = None):
    """Get current session info"""
    if not session_token:
        # Check cookies if not in query param
        session_token = request.cookies.get("session_token")
        
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if not hasattr(request.app.state, 'sessions') or session_token not in request.app.state.sessions:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    return request.app.state.sessions[session_token]
