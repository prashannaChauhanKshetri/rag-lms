# RAG-LMS | AI-Powered Learning Management System

A modern, role-based educational platform powered by AI and RAG (Retrieval Augmented Generation), now upgraded to **PostgreSQL** for performance and scalability.

## 🎯 Project Overview

**Final Year Project** building an intelligent LMS with:
- **Admin Dashboard** - System monitoring and user management.
- **Instructor Portal** - Course creation, content upload, question/flashcard generation.
- **Student Portal** - AI chat tutors, flashcards, and quizzes.

## 🚀 Key Features

### Role-Based Interface
| Role | Features |
|------|----------|
| **Admin** | System overview, user management, analytics, session tracking |
| **Instructor** | Create chat bots, upload PDFs, generate questions & flashcards, test AI |
| **Student** | Chat with AI tutors, study flashcards, take quizzes, view results |

### AI & RAG Capabilities
- **Hybrid Search**: Combining PostgreSQL Full-Text Search (BM25-style) + `pgvector` (semantic) search.
- **Fast OCR**: Parallel Tesseract processing for scanned documents.
- **Structure Detection**: TOC extraction via Docling for chapter-aware chunking.
- **Page Citations**: Answers include clickable source page references.
- **Feedback Loop**: Instructors can correct answers to improve future performance (RLHF-lite).

### Modern UI Design
- Premium user experience with glassmorphism effects and modern typography.
- Interactive dashboards with Chart.js visualizations.

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | FastAPI, Python 3.11+ |
| **LLM** | Groq API (llama-3.3-70b) |
| **OCR** | Tesseract (parallel processing) |
| **Embeddings** | Sentence Transformers (`all-MiniLM-L6-v2`) |
| **Vector Store** | **PostgreSQL + pgvector** (Hybrid Search) |
| **Database** | **PostgreSQL 17** (Metadata & Vector) |
| **Frontend** | Vanilla HTML/CSS/JS, Lucide Icons |

## 📋 Prerequisites

- **Python 3.11+**
- **PostgreSQL 14+** (with `pgvector` extension)
- **Tesseract OCR** installed
- **Groq API Key** (for LLM)

## 🔧 Installation & Setup

### 1. Database Setup (macOS Example)
```bash
# Install PostgreSQL and pgvector via Homebrew
brew install postgresql@17
brew install pgvector

# Start PostgreSQL service
brew services start postgresql@17

# Initial Database Setup
# This will create the 'rag_lms' database, user, and schema
bash init_database.sh
```

### 2. Application Setup
```bash
# Clone repository
git clone https://github.com/prashannaChauhanKshetri/rag-lms.git
cd rag-lms

# Create virtual environment
python3 -m venv env
source env/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Environment Variables
Create a `.env` file in the root directory:
```env
# Groq API Configuration
GROQ_API_KEY=your_groq_api_key_here

# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=rag_lms
POSTGRES_USER=rag_lms_user
POSTGRES_PASSWORD=raglms_secure_2025
DATABASE_URL=postgresql://rag_lms_user:raglms_secure_2025@localhost:5432/rag_lms
```

## 🏃 Running the Application

```bash
# Start the FastAPI server
source env/bin/activate
uvicorn api:app --reload --port 8000
```

Access the application:
- **Landing Page (Login)**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Admin**: [http://127.0.0.1:8000/admin.html](http://127.0.0.1:8000/admin.html)
- **Instructor**: [http://127.0.0.1:8000/instructor.html](http://127.0.0.1:8000/instructor.html)
- **Student**: [http://127.0.0.1:8000/student.html](http://127.0.0.1:8000/student.html)

**Demo Credentials**:
- Admin: `admin` / `admin123`
- Instructor: `instructor` / `instructor123`
- Student: `student` / `student123`

## 📁 Project Structure

```
rag-lms/
├── api.py                  # FastAPI backend (Main Entry Point)
├── database_postgres.py    # PostgreSQL metadata operations
├── vectorstore_postgres.py # PostgreSQL + pgvector hybrid search
├── utils.py                # PDF processing & OCR logic
├── init_database.sh        # Database initialization script
├── setup_postgres.sql      # Database schema & functions
├── requirements.txt        # Python dependencies
├── fin_ed_docs/            # Uploaded PDF storage
└── static/                 # Frontend assets (HTML, CSS, JS)
```

## 👤 Author

**Prashanna Chauhan Kshetri**

---
**Version**: 1.2.0 | **Updated**: December 2025
