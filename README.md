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
| **Admin** | System overview, user management, analytics, session tracking |
| **Instructor** | Create chat bots, upload PDFs, generate questions & flashcards, test AI |
| **Student** | Chat with AI tutors, study flashcards, take quizzes, view results |

### AI & RAG Capabilities
- **Hybrid Retrieval**: BM25 (keyword) + FAISS (semantic) search
- **Fast OCR**: Parallel Tesseract processing for scanned documents
- **Structure Detection**: TOC extraction via Docling for chapter-aware chunking
- **Page Citations**: Answers include source page references
- **Feedback Loop**: Instructors can correct answers to improve future performance

### Modern UI Design
- Premium user experience with glassmorphism effects
- Custom color palette: Cream `#e8d8c9` | Blue-gray `#4b607f` | Orange `#f3701e`
- Interactive dashboards with Chart.js visualizations

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | FastAPI, Python 3.11+ |
| **LLM** | Groq API (llama-3.3-70b) |
| **OCR** | Tesseract (parallel processing) |
| **Embeddings** | Sentence Transformers (all-MiniLM-L6-v2) |
| **Vector Store** | FAISS + BM25 Hybrid |
| **Database** | SQLite (users, conversations, quizzes) |
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
- **Landing Page (Login)**: http://127.0.0.1:8000
- **Admin**: http://127.0.0.1:8000/admin.html
- **Instructor**: http://127.0.0.1:8000/instructor.html
- **Student**: http://127.0.0.1:8000/student.html
- **API Docs**: http://127.0.0.1:8000/docs

**Demo Credentials**:
- Admin: `admin` / `admin123`
- Instructor: `instructor` / `instructor123`
- Student: `student` / `student123`

## 📁 Project Structure

```
rag-lms/
├── api.py              # FastAPI backend (Main Entry Point)
├── database.py         # SQLite operations
├── utils.py            # PDF processing & OCR
├── vectorstore.py      # FAISS + BM25 hybrid search
├── requirements.txt
├── rag_lms.db          # SQLite Database
├── fin_ed_docs/        # Uploaded documents storage
├── vectorstores/       # Vector index storage
├── static/
│   ├── index.html      # Landing page
│   ├── login.html      # Login page
│   ├── admin.html      # Admin dashboard
│   ├── instructor.html # Instructor dashboard
│   ├── student.html    # Student portal
│   ├── css/            # Stylesheets
│   └── js/             # JavaScript
└── README.md
```

## 📚 Usage

### Instructor Workflow
1. **Manage Chatbots**: Create specialized chatbots for different courses/topics.
2. **Knowledge Base**: Upload PDF textbooks/materials.
3. **Tools**: Generate quizzes and flashcards automatically from content.
4. **Simulator**: Test chatbot responses and provide corrections (RLHF-lite).

### Student Workflow
1. **Study**: Select a course chatbot to ask questions.
2. **Practice**: Take assigned quizzes and view scores.
3. **Review**: Flip through flashcards for active recall.

## 🗺️ Roadmap

- [x] Core RAG pipeline with Hybrid Search
- [x] Fast parallel OCR for scanned PDFs
- [x] Role-based UI (Admin/Instructor/Student)
- [x] Question & Flashcard Generator
- [x] Complete Quiz System (Creation, Taking, Grading)
- [x] User Authentication & Session Management
- [x] Learning Analytics (Admin Dashboard)
- [ ] Multi-Modal Support (Images in Chat)

## 👤 Author

**Prashanna Chauhan Kshetri**

---
**Version**: 1.1.0 | **Last Updated**: December 2024
