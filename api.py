# api.py - SLIM Entry Point for RAG-LMS
import os
import logging
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

# Load environment variables FIRST
load_dotenv()

# Validate critical environment variables
required_env_vars = ["JWT_SECRET_KEY", "POSTGRES_HOST", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"]
missing_vars = [var for var in required_env_vars if not os.getenv(var)]
if missing_vars:
    logging.error(f"CRITICAL: Missing required environment variables: {', '.join(missing_vars)}")
    logging.error("Please set these in your .env file and restart the server.")
    sys.exit(1)

# Import local routers
from routes import auth, admin, chatbots, chat, instructor, student, super_admin, notifications
from models import get_embed_model
import database_postgres as db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database and create demo users on startup
    try:
        db.init_db()
        logging.info("✓ Database initialized with demo users")
    except Exception as e:
        logging.error(f"✗ Database initialization failed: {e}")
    
    # Skip embedding model loading - will be lazy loaded on first use
    logging.info("✓ Server startup complete")
    
    yield
    
    # Clean up on shutdown
    pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag-api")

app = FastAPI(title="RAG-LMS API", lifespan=lifespan)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Content-Security-Policy — tighten in production
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self';"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)


# CORS configuration - restrict to trusted origins only (FIX CRITICAL VULNERABILITY)
allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost"
).split(",")
# Strip whitespace from each origin
allowed_origins = [origin.strip() for origin in allowed_origins]

logging.info(f"CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Serve static files
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve upload files (student submissions)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "RAG-LMS API"
    }

# --- Include Routers ---
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(super_admin.router)
app.include_router(chatbots.router)
app.include_router(chat.router)
app.include_router(instructor.router)
app.include_router(student.router)
app.include_router(notifications.router)

# --- Root Page Routes ---
@app.get("/")
def index():
    return FileResponse("static/login.html")

@app.get("/login.html")
def login_page():
    return FileResponse("static/login.html")

@app.get("/admin.html")
def admin_page():
    return FileResponse("static/admin.html")

@app.get("/instructor.html")
def instructor_page():
    return FileResponse("static/instructor.html")

@app.get("/student.html")
def student_page():
    return FileResponse("static/student.html")

# Serve CSS and JS files directly if needed (some frontend code might use /css/ instead of /static/css/)
@app.get("/css/{filename}")
def serve_css(filename: str):
    return FileResponse(f"static/css/{filename}")

@app.get("/js/{filename}")
def serve_js(filename: str):
    return FileResponse(f"static/js/{filename}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)