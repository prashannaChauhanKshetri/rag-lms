# RAG-LMS | AI-Powered Learning Management System

A modern, role-based educational platform powered by AI and RAG (Retrieval Augmented Generation), featuring a high-performance **PostgreSQL** backend and a reactive **React** frontend.

## 🎯 Project Overview

**Final Year Project** building an intelligent LMS with:
- **Admin Dashboard** - Teacher management, **enrollment management (registrar)**, institution analytics, and system monitoring
- **Instructor Portal** - Class & section management, assignments, attendance tracking, lesson planning, quiz/flashcard generation (read-only student roster)
- **Student Portal** - Course enrollment, assignment submission, grading feedback, quizzes, flashcards, and AI-powered tutoring

## 🚀 Key Features

### 1. Class & Subject Management
- Hierarchical organization: **Classes** → **Subjects (Chatbots)** → **Sections**
- Teachers are assigned to specific subjects within a class
- **Admin-managed enrollment** — Admins (registrars) enroll/remove students via the Enrollment Center
- Instructors have read-only access to their section rosters
- Easy class cloning and archival

### 2. Assignment Management
- **Instructors**: Create, publish, and grade assignments with detailed rubrics
- **Students**: Upload assignment files, track submission history, view grades and feedback
- File upload support (PDF, DOCX, XLSX, etc.) with automatic storage
- Submission history with version tracking

### 3. Attendance Tracking
- Section-wide attendance marking (Present/Absent/Late/Excused)
- Bulk attendance updates
- Attendance reports and statistics per student
- Calendar-based attendance views

### 4. Advanced AI Tools & Content Generation
- **Lesson Planner**: Generates detailed lesson plans strictly grounded in textbook content (no hallucinations).
- **Quiz Generator**: Auto-creates MCQs, True/False, and Short Answer questions from course material.
- **Flashcard Creator**: Generates study flashcards for students based on specific topics.
- **Smart Context**: Uses RAG to find relevant textbook pages for all generated content.

### 5. Analytics & Progress Tracking
- **Instructor Dashboard**: View course performance, average scores, and assignment completion rates.
- **Student Progress**: Visual timeline of grades and assignment completion.
- **Gradebook**: Comprehensive view of student performance across all assessments.

### 6. Teacher Profile Management (Admin)
- Comprehensive teacher profiles: First/Last name, email, phone, qualifications, department
- Years of experience, office location, office hours tracking
- Admin can view all teachers and their teaching load
- Teacher class assignments and created assignments tracking

### 7. Hybrid Search & RAG (Work in Progress)
- Combining PostgreSQL Full-Text Search (BM25) + `pgvector` (semantic) search
- Course-aware document retrieval
- Intelligent quiz and flashcard auto-generation
- Student can chat with AI tutor

### 6. Role-Based Access Control
| Role | Features |
|------|----------|
| **Admin** | Manage teachers, **enroll/remove students (registrar)**, view analytics, system configuration |
| **Instructor** | View assigned classes/subjects, manage sections, create assignments, track attendance, generate quizzes |
| **Student** | View enrolled sections, submit assignments, take quizzes, study with flashcards, chat with AI tutors |

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | FastAPI (Python 3.11+), Uvicorn |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons |
| **AI/LLM** | Groq API (Llama 3.3 70B), SentenceTransformers |
| **Database** | PostgreSQL 17 + pgvector (Hybrid Search) |
| **Auth** | JWT (HS256), Cookie-based Sessions |
| **OCR** | Tesseract (Parallel Processing) |

## 📋 Prerequisites

- **Python 3.11+**
- **Node.js 18+** (for frontend)
- **PostgreSQL 17+** (with pgvector extension)
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

# Create .env file with your credentials
cat > .env << EOF
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=rag_lms
POSTGRES_USER=rag_lms_user
POSTGRES_PASSWORD=raglms_secure_2025
GROQ_API_KEY=your_groq_key_here
JWT_SECRET_KEY=your_secret_key_here
EOF

# Start API server
python api.py
# Server runs on http://localhost:8000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

## 📁 Project Structure

```
rag-lms/
├── api.py                      # FastAPI Entry Point
├── database_postgres.py        # Database Logic & Helper Functions
├── vectorstore_postgres.py     # Vector Search & Hybrid Query Logic
├── models.py                   # Embedding Model Loader
├── utils.py                    # PDF Processing, Chunking Utilities
├── utils_auth.py               # JWT & Authentication Logic
├── routes/                     # API Route Handlers
│   ├── auth.py                # Login/Logout endpoints
│   ├── admin.py               # Teacher management, analytics
│   ├── instructor.py          # Classes, assignments, attendance
│   ├── student.py             # Course enrollment, submissions
│   ├── chat.py                # AI chat and LLM interaction
│   └── chatbots.py            # Course management
├── frontend/                   # React Vite Application
│   └── src/components/        
│       ├── admin/             # AdminTeacherManager, analytics
│       ├── instructor/        # ClassManager, AssignmentManager, AttendanceManager
│       ├── student/           # StudentAssignmentManager, CourseOverview
│       └── shared/            # Sidebar, Header, Navigation
├── setup_postgres.sql          # Database schema & functions
├── uploads/                    # Student assignment submission files
└── static/                     # Built frontend & static assets
```

## 🔐 Authentication

- **Login**: Username + password authentication with bcrypt hashing
- **JWT Tokens**: HTTP-only cookies with 24-hour expiration
- **Legacy Support**: SHA256 fallback for demo users during migration

## 📊 API Endpoints Summary

### Admin Routes (`/admin`)
- `GET /teachers` - List all teachers with profiles
- `GET /teachers/{user_id}` - Teacher details
- `PUT /teachers/{user_id}/profile` - Update teacher info
- `GET /teachers/{user_id}/classes` - Teacher's classes
- `GET /teachers/{user_id}/assignments` - Teacher's assignments
- **Enrollment Management (Registrar):**
  - `GET /sections/all` - List all sections with student counts
  - `POST /sections/{id}/enroll` - Single student enrollment
  - `POST /sections/{id}/bulk-enroll` - Bulk enrollment (IDs or CSV)
  - `DELETE /sections/{id}/students/{sid}` - Remove student
  - `GET /sections/{id}/available-students` - Search unenrolled students
  - `GET /sections/{id}/enrollment-history` - Audit trail

### Instructor Routes (`/instructor`)
- **Course Mgmt**: `POST /classes`, `POST /sections`
- **Roster**: `GET /sections/{id}/students` (read-only view)
- **AI Tools**: 
  - `POST /lesson-plans/generate` - Generate lesson plans
  - `POST /questions/generate` - Generate quiz questions
  - `POST /flashcards/generate` - Create study cards
- **Assignments**: `POST /assignments/create`, `GET /submissions`, `POST /grade`
- **Analytics**: `GET /analytics/course/{id}` - View course performance

### Student Routes (`/student`)
- **Dashboard**: `GET /sections` (with attendance & pending tasks)
- **Learning**: 
  - `GET /assignments/pending` - View due tasks
  - `GET /quizzes/{id}/take` - Take quizzes
  - `POST /quizzes/submit` - Submit answers
- **Progress**: `GET /progress`, `GET /grades` - View academic performance
- **Resources**: `GET /resources` - Access course materials

## 🎓 Demo Credentials

**Admin User:**
- Username: `admin` | Password: `admin123`

**Instructor User:**
- Username: `instructor` | Password: `instructor123`

**Student User:**
- Username: `student` | Password: `student123`

## 📝 Environment Variables

```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=rag_lms
POSTGRES_USER=rag_lms_user
POSTGRES_PASSWORD=your_secure_password

# LLM & API
GROQ_API_KEY=your_groq_api_key
JWT_SECRET_KEY=your_jwt_secret

# Optional
TOKENIZERS_PARALLELISM=false
```

## 🚀 Deployment

### Using Docker (Recommended)
```bash
docker-compose up
```

### Manual Deployment
1. Install dependencies on production server
2. Set environment variables
3. Run database migrations
4. Build frontend: `cd frontend && npm run build`
5. Start FastAPI with production ASGI server (Gunicorn)

## 🤝 Contributing

Pull requests welcome! Please ensure:
- Code follows existing style
- Tests pass
- Database migrations included for schema changes

## 📄 License

MIT License - See LICENSE file

## 👤 Author

**Prashanna Chauhan Kshetri**

---
**Version**: 2.0.0 | **Updated**: February 2026

### Features Checklist
- ✅ Class & Section Management
- ✅ Assignment Submission & Grading
- ✅ Attendance Tracking & Reporting
- ✅ Teacher & Student Profiles
- ✅ Admin Dashboard & Analytics
- ✅ **Admin Enrollment Center (Registrar)**
- ✅ Hybrid Search (BM25 + Vector)
- ✅ AI Lesson Planner (Textbook Grounded)
- ✅ Quiz & Flashcard Generation
- ✅ Student Progress Tracking
- ✅ JWT Authentication & Security
- ✅ File Upload (S3/Local)
- ✅ AI Tutoring Chat
- ✅ Password Visibility Toggle (Login)
