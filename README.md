# RAG-LMS | AI-Powered Learning Management System

A modern, role-based educational platform powered by AI and RAG (Retrieval Augmented Generation).

## 🎯 Project Overview

**Final Year Project** building an intelligent LMS with:
- **Admin Dashboard** - System monitoring and user management
- **Instructor Portal** - Course creation, content upload, question/flashcard generation
- **Student Portal** - AI chat tutors, flashcards, and quizzes

## 🚀 Key Features

### Role-Based Interface
| Role | Features |
|------|----------|
| **Admin** | System overview, course management, analytics |
| **Instructor** | Create courses, upload PDFs, generate questions & flashcards, test AI |
| **Student** | Chat with AI tutors, study flashcards, take quizzes |

### AI & RAG Capabilities
- **Hybrid Retrieval**: BM25 (keyword) + FAISS (semantic) search
- **Fast OCR**: Parallel Tesseract processing for scanned documents
- **Structure Detection**: TOC extraction via Docling for chapter-aware chunking
- **Page Citations**: Answers include source page references

### Modern UI Design
- Premium dark theme with custom color palette:
  - Cream `#e8d8c9` | Blue-gray `#4b607f` | Orange `#f3701e`
- Lucide SVG icons
- Responsive layout with glassmorphism effects

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | FastAPI, Python 3.11+ |
| **LLM** | Groq API (llama-3.3-70b) |
| **OCR** | Tesseract (parallel processing) |
| **Embeddings** | Sentence Transformers (all-MiniLM-L6-v2) |
| **Vector Store** | FAISS + BM25 Hybrid |
| **Database** | SQLite |
| **Frontend** | Vanilla HTML/CSS/JS, Lucide Icons |

## 📋 Prerequisites

- Python 3.11+
- Tesseract OCR installed
- Groq API key (for LLM)

## 🔧 Installation

```bash
# Clone repository
git clone https://github.com/prashannaChauhanKshetri/rag-lms.git
cd rag-lms

# Create virtual environment
python3 -m venv env
source env/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
echo "GROQ_API_KEY=your_key_here" > .env
```

## 🏃 Running the Application

```bash
python api.py
```

Access the application:
- **Landing Page**: http://127.0.0.1:8000
- **Admin**: http://127.0.0.1:8000/admin.html
- **Instructor**: http://127.0.0.1:8000/instructor.html
- **Student**: http://127.0.0.1:8000/student.html
- **API Docs**: http://127.0.0.1:8000/docs

## 📁 Project Structure

```
rag-lms/
├── api.py              # FastAPI backend
├── database.py         # SQLite operations
├── utils.py            # PDF processing & OCR
├── vectorstore.py      # FAISS + BM25 hybrid search
├── retrieval.py        # Retrieval logic
├── app.py              # Chainlit interface (alternative)
├── requirements.txt
├── static/
│   ├── index.html      # Landing page
│   ├── admin.html      # Admin dashboard
│   ├── instructor.html # Instructor dashboard
│   ├── student.html    # Student portal
│   ├── css/            # Stylesheets
│   └── js/             # JavaScript
└── README.md
```

## 📚 Usage

### Instructor Workflow
1. Create a course in **Courses** panel
2. Upload PDFs in **Content** panel
3. Generate questions in **Questions** panel
4. Create flashcards in **Flashcards** panel
5. Test AI responses in **Simulator**

### Student Workflow
1. Select a course from dropdown
2. Chat with AI tutor
3. View source citations

## 🗺️ Roadmap

- [x] Core RAG pipeline
- [x] Fast parallel OCR
- [x] Role-based UI (Admin/Instructor/Student)
- [x] Question Generator
- [x] Flashcard Creator
- [ ] Quiz Builder (structured)
- [ ] User Authentication
- [ ] Learning Analytics



## 👤 Author

**Prashanna Chauhan Kshetri**

---
**Version**: 1.0.0 | **Last Updated**: December 2024
