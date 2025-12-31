# api.py - SLIM Entry Point for RAG-LMS
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables FIRST
load_dotenv()

# Import local routers
from routes import auth, admin, chatbots, chat, instructor, student
from models import get_embed_model

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load model on startup to cache it
    try:
        get_embed_model()
        logging.info("\u2713 Embedding model initialized successfully")
    except Exception as e:
        logging.error(f"Failed to load embedding model: {e}")
    
    yield
    
    # Clean up on shutdown
    pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag-api")

app = FastAPI(title="RAG-LMS API", lifespan=lifespan)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "RAG-LMS API"
    }

# --- Include Routers ---
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(chatbots.router)
app.include_router(chat.router)
app.include_router(instructor.router)
app.include_router(student.router)

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