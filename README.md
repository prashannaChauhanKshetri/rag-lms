# RAG-LMS | AI-Powered Learning Management System

A modern, role-based educational platform powered by AI and RAG (Retrieval Augmented Generation), featuring a high-performance **PostgreSQL** backend and a reactive **React** frontend.

## 🎯 Project Overview

**Final Year Project** building an intelligent LMS with:
- **Admin Dashboard** - System monitoring, usage analytics, and user management.
- **Instructor Portal** - Course management, AI-assisted lesson planning, assignment grading, and content generation (Quizzes/Flashcards).
- **Student Portal** - AI chat tutors with context-aware RAG, assignment submissions, interactive quizzes, and study flashcards.

## 🚀 Key Features

### Role-Based Interface
| Role | Features |
|------|----------|
| **Admin** | System health, user role management, system-wide analytics |
| **Instructor** | AI Lesson Planner, Assignment Manager & Grading, RAG-powered Quiz/Flashcard generation |
| **Student** | Interactive AI Course Tutors, Assignment Submission, Progress Tracking, Quiz Performance |

### AI & RAG Capabilities
- **Hybrid Search**: Combining PostgreSQL Full-Text Search (BM25) + `pgvector` (semantic) search for precise context retrieval.
- **Assignment Grading**: Automated workflow for instructors to review, grade, and provide feedback on student submissions.
- **Lesson Planning**: AI-assisted tool for generating structured course content and objectives.
- **TOC Aware Chunking**: Chapter-aware document processing for better retrieval accuracy.
- **Source Citations**: AI responses include verifiable page references from course materials.

### Modern UI/UX
- Premium **React** interface with polished animations (Sidebar/Modals).
- Lucide Icon system for intuitive navigation.
- Glassmorphism design language with sleek dark/light mode aesthetics.

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | FastAPI (Python 3.11+), Uvicorn |
| **Frontend** | React 18, Vite, TypeScript, Lucide Icons |
| **AI/LLM** | Groq API (Llama 3.3 70B), Sentence Transformers |
| **Database** | PostgreSQL 17 + **pgvector** (Hybrid Search) |
| **OCR** | Tesseract (Parallel Multi-process OCR) |

## 📋 Prerequisites

- **Python 3.11+**
- **Node.js 18+** (for frontend)
- **PostgreSQL 17+** (with `pgvector` extension)
- **Tesseract OCR** installed
- **Groq API Key** (for LLM services)

## 🔧 Installation & Setup

### 1. Database Setup
```bash
# Initialize PostgreSQL schema and demo data
bash init_database.sh
```

### 2. Backend Setup
```bash
# Create and activate environment
python3 -m venv env
source env/bin/activate
pip install -r requirements.txt

# Start API server
python api.py
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## 📁 Project Structure

```
rag-lms/
├── api.py                  # FastAPI Entry Point
├── database_postgres.py    # Database Logic & Metadata
├── vectorstore_postgres.py # Vector Search Logic
├── routes/                 # API Route Groups (Auth, Instructor, Student, etc.)
├── models.py               # ML Model Loader
├── frontend/               # React (Vite) Frontend Application
│   └── src/components/     # Modular UI Components (Dashboards, Managers)
├── static/                 # Served Assets & Legacy Pages
├── uploads/                # Student Assignment Submissions
└── setup_postgres.sql      # Database Schema & Functions
```

## 👤 Author

**Prashanna Chauhan Kshetri**

---
**Version**: 1.5.0 | **Updated**: January 2026
