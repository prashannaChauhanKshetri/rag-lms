# utils_auth.py
from datetime import datetime, timedelta
from typing import Optional, Dict
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
import sys
import logging
from fastapi import HTTPException, status, Request
from dotenv import load_dotenv

load_dotenv()

# JWT Configuration - REQUIRE environment variable (FIX CRITICAL VULNERABILITY)
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    logging.error(
        "CRITICAL: JWT_SECRET_KEY environment variable is not set!\n"
        "This is required for secure token signing.\n"
        "Generate a secure key with:\n"
        "  python -c 'import secrets; print(secrets.token_urlsafe(32))'\n"
        "Then add to your .env file:\n"
        "  JWT_SECRET_KEY=<generated_value>"
    )
    sys.exit(1)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Password Hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

logger = logging.getLogger("rag-auth")

def verify_password(plain_password, hashed_password):
    """Verify a password against a hash"""
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        # Fallback for old SHA256 hashes (temporary migration path)
        import hashlib
        logger.warning(f"Bcrypt verification failed, trying legacy SHA256: {e}")
        try:
            legacy_hash = hashlib.sha256(plain_password.encode()).hexdigest()
            return legacy_hash == hashed_password
        except:
            return False

def get_password_hash(password):
    """Hash a password using bcrypt"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a new JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict]:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

def get_current_user_from_token(token: str) -> Optional[Dict]:
    """Get user data from token"""
    payload = decode_access_token(token)
    if not payload:
        return None
    return payload

async def get_current_user(request: Request):
    """
    Dependency to get current user from cookie.
    Usage: user = Depends(get_current_user)
    """
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    user_data = get_current_user_from_token(token)
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session"
        )
    
    return user_data
# ============================================
# Authorization Helper Functions
# ============================================

def require_role(allowed_roles):
    """
    Dependency to require specific user role(s).
    Usage: Depends(require_role(["instructor", "admin"]))
    """
    async def check_role(user: Dict = None, request: Request = None):
        if user is None:
            user = await get_current_user(request)
        
        user_role = user.get("role")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' is not authorized. Required: {allowed_roles}"
            )
        return user
    
    return check_role

async def check_section_access(user: Dict, section_id: str, mode: str = "learn"):
    """
    Check if user can access a section.
    mode: "teach" (teacher management) or "learn" (student participation)
    Returns True if authorized, raises HTTPException otherwise.
    """
    import database_postgres as db
    
    teacher_id = user.get("sub") or user.get("id")
    
    if mode == "teach":
        # Teacher must own the section
        if user.get("role") != "instructor":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only instructors can manage sections"
            )
        
        if not db.can_teacher_manage_section(teacher_id, section_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to manage this section"
            )
    
    elif mode == "learn":
        # Student must be enrolled
        if user.get("role") not in ["student", "instructor"]:  # instructors can view their sections
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to access this section"
            )
        
        # Instructors can access their own sections; students must be enrolled
        if user.get("role") == "student":
            if not db.can_student_access_section(teacher_id, section_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not enrolled in this section"
                )
    
    return True

def require_institution(user: Dict, required_institution_id: str):
    """
    Check if user belongs to a specific institution.
    """
    user_institution_id = user.get("institution_id")
    if user_institution_id != required_institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to resources from this institution"
        )
    return True

def get_user_id(user: Dict) -> str:
    """
    Extract user ID from JWT token payload.
    Tries 'sub' first (standard JWT subject claim), falls back to 'id'.
    Raises HTTPException if neither claim is present.
    """
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot determine user ID from authentication token"
        )
    return user_id