from fastapi import APIRouter, HTTPException, Body, Response, Request, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import database_postgres as db
import utils_auth

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(response: Response, login_data: LoginRequest):
    """Login endpoint with JWT"""
    # 1. Fetch user from DB
    user = db.get_user_by_username(login_data.username)
    
    # 2. Verify credentials
    if not user or not utils_auth.verify_password(login_data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # 3. Create JWT Token
    token_data = {
        "sub": user['id'],
        "username": user['username'],
        "role": user['role'],
        "full_name": user['full_name']
    }
    access_token = utils_auth.create_access_token(data=token_data)
    
    res_data = {
        "message": "Login successful",
        "user": {
            "id": user['id'],
            "username": user['username'],
            "role": user['role'],
            "full_name": user['full_name'],
            "email": user['email']
        },
        "access_token": access_token
    }
    
    # 4. Set Cookie
    result = JSONResponse(content=res_data)
    result.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=86400,  # 24 hours
        samesite="lax"
    )
    
    return result

@router.post("/logout")
async def logout():
    """Logout endpoint"""
    response = JSONResponse({"message": "Logged out successfully"})
    response.delete_cookie("access_token")
    return response

@router.get("/session")
async def get_session(request: Request):
    """Get current session info from JWT"""
    # Check for token in cookie
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Decode token
    user_data = utils_auth.decode_access_token(token)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Return user info (mapping 'sub' back to 'user_id' for frontend compatibility)
    return {
        "user_id": user_data.get("sub"),
        "username": user_data.get("username"),
        "role": user_data.get("role"),
        "full_name": user_data.get("full_name")
    }
