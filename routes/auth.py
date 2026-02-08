from fastapi import APIRouter, HTTPException, Body, Response, Request, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, validator
import database_postgres as db
import utils_auth
import secrets
import re
from typing import Optional

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

class SignupRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    confirm_password: str
    full_name: str
    role: str  # 'student' or 'instructor' or 'admin'
    institution_id: str
    
    @validator('username')
    def validate_username(cls, v):
        if len(v) < 3:
            raise ValueError('Username must be at least 3 characters')
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError('Username can only contain alphanumeric characters, underscore, and hyphen')
        return v
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v
    
    @validator('confirm_password')
    def validate_confirm_password(cls, v, values):
        if 'password' in values and v != values['password']:
            raise ValueError('Passwords do not match')
        return v

class VerifyEmailRequest(BaseModel):
    token: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    confirm_password: str
    
    @validator('new_password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        return v

@router.post("/signup")
async def signup(signup_data: SignupRequest):
    """Sign up a new user with role-based account creation"""
    
    # Validate role
    if signup_data.role not in ['student', 'instructor', 'admin']:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'student', 'instructor', or 'admin'")
    
    # Check if username exists
    existing_user = db.get_user_by_username(signup_data.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Check if email exists
    existing_email = db.get_user_by_email(signup_data.email)
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Verify institution exists
    institution = db.get_institution(signup_data.institution_id)
    if not institution:
        raise HTTPException(status_code=400, detail="Institution not found")
    
    try:
        # Create user
        user_id = db.create_user(
            username=signup_data.username,
            email=signup_data.email,
            password=signup_data.password,
            full_name=signup_data.full_name,
            role=signup_data.role,
            institution_id=signup_data.institution_id,
            is_email_verified=False
        )
        
        # Create role-specific profile
        if signup_data.role == 'student':
            db.create_student_profile(
                user_id=user_id,
                institution_id=signup_data.institution_id,
                first_name=signup_data.full_name.split()[0] if signup_data.full_name else '',
                last_name=' '.join(signup_data.full_name.split()[1:]) if len(signup_data.full_name.split()) > 1 else ''
            )
        elif signup_data.role == 'instructor':
            db.create_teacher_profile(
                user_id=user_id,
                institution_id=signup_data.institution_id,
                first_name=signup_data.full_name.split()[0] if signup_data.full_name else '',
                last_name=' '.join(signup_data.full_name.split()[1:]) if len(signup_data.full_name.split()) > 1 else ''
            )
        
        # Generate and send verification token (magic link)
        verification_token = secrets.token_urlsafe(32)
        db.create_verification_token(
            user_id=user_id,
            token=verification_token,
            token_type='email_verification',
            expires_in_minutes=24 * 60  # 24 hours
        )
        
        # TODO: Send email with verification link
        # email_service.send_verification_email(signup_data.email, verification_token)
        
        return {
            "message": "Signup successful. Please check your email to verify your account.",
            "user_id": user_id,
            "email": signup_data.email
            # FIX CRITICAL VULNERABILITY: Removed verification_token from response
            # Token is now only sent via email, never exposed in API response
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Signup failed: {str(e)}")

@router.post("/verify-email")
async def verify_email(verify_data: VerifyEmailRequest):
    """Verify email using magic link token"""
    
    # Verify token
    token_record = db.verify_token(verify_data.token, token_type='email_verification')
    if not token_record:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    
    try:
        # Mark email as verified
        db.mark_email_verified(token_record['user_id'])
        db.mark_token_used(verify_data.token)
        
        # Get user info
        user = db.get_user_by_id(token_record['user_id'])
        
        return {
            "message": "Email verified successfully",
            "user": {
                "id": user['id'],
                "username": user['username'],
                "email": user['email'],
                "full_name": user['full_name'],
                "role": user['role']
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")

@router.post("/forgot-password")
async def forgot_password(forgot_data: ForgotPasswordRequest):
    """Request password reset via email"""
    
    # Check if user exists
    user = db.get_user_by_email(forgot_data.email)
    if not user:
        # Return generic message to avoid email enumeration
        return {
            "message": "If an account with this email exists, a password reset link has been sent."
        }
    
    try:
        # Generate password reset token
        reset_token = secrets.token_urlsafe(32)
        db.create_verification_token(
            user_id=user['id'],
            token=reset_token,
            token_type='password_reset',
            expires_in_minutes=30  # 30 minutes for password reset
        )
        
        # TODO: Send email with reset link
        # email_service.send_password_reset_email(user['email'], reset_token)
        
        return {
            "message": "If an account with this email exists, a password reset link has been sent.",
            "reset_token": reset_token  # TODO: Remove in production, send via email only
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Password reset request failed: {str(e)}")

@router.post("/reset-password")
async def reset_password(reset_data: ResetPasswordRequest):
    """Reset password using magic link token"""
    
    if reset_data.new_password != reset_data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    
    # Verify token
    token_record = db.verify_token(reset_data.token, token_type='password_reset')
    if not token_record:
        raise HTTPException(status_code=400, detail="Invalid or expired password reset token")
    
    try:
        # Update password
        new_password_hash = utils_auth.get_password_hash(reset_data.new_password)
        db.update_user_password(token_record['user_id'], new_password_hash)
        db.mark_token_used(reset_data.token)
        
        return {
            "message": "Password reset successful. You can now login with your new password."
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Password reset failed: {str(e)}")


@router.get("/institutions")
async def get_public_institutions():
    """Get all active institutions (Public endpoint for login/signup forms)"""
    try:
        institutions = db.list_institutions(active_only=True)
        return {
            "institutions": institutions,
            "count": len(institutions)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve institutions: {str(e)}")


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
        "full_name": user['full_name'],
        "institution_id": user['institution_id']
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
        "full_name": user_data.get("full_name"),
        "institution_id": user_data.get("institution_id")
    }
