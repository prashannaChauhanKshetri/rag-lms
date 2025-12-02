# RAG-Based Learning Management System (LMS)

A privacy-focused, AI-powered educational platform that enables students to learn from their textbooks using local LLMs.

## 🎯 Project Overview

This is a **Final Year Project (FYP)** building an intelligent LMS that runs locally. It allows:
- **Instructors** to create courses, upload textbooks, and manage student access.
- **Students** to ask questions and receive accurate answers with page citations.
- **AI Tutors** to provide context-aware explanations using RAG (Retrieval Augmented Generation).

## 🚀 Key Features

- **Local-First AI**: Uses **Phi-3-Mini** for chat and **Qwen3-VL** for OCR, running entirely on your machine via Ollama.
- **Smart Ingestion**: 
  - Automatically detects Table of Contents (TOC) for structure-aware chunking.
  - Uses Vision-Language Models (VLM) to read scanned pages and diagrams.
- **Instructor Dashboard**: A modern interface for:
  - **Course Management**: Create and configure AI tutors.
  - **Content Management**: Upload and process PDFs.
  - **Student Management**: Track enrollment (Mock).
  - **Analytics**: Monitor query performance and improve answers.
- **Hybrid Retrieval**: Combines Keyword Search (BM25) and Semantic Search (FAISS) for high accuracy.
- **Page Citations**: Every answer is backed by specific page references.

## 🛠️ Tech Stack

### Backend
- **FastAPI** - High-performance API framework
- **Ollama** - Local LLM runner (Phi-3-Mini, Qwen3-VL)
- **LangChain & FAISS** - RAG pipeline and Vector Store
- **Sentence Transformers** - Local embeddings (`all-MiniLM-L6-v2`)
- **PyMuPDF (Fitz)** - PDF processing

### Frontend
- **HTML5 / CSS3 / JavaScript** - Responsive Instructor Dashboard
- **Chart.js** - Analytics visualization

## 📋 Prerequisites

- Python 3.11+
- **Ollama** installed (https://ollama.com)
- 8GB+ RAM recommended (for running models locally)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd rag-lms
   ```

2. **Set up Virtual Environment**
   ```bash
   python3 -m venv env
   source env/bin/activate
   pip install -r requirements.txt
   ```

3. **Install & Pull Local Models**
   Make sure Ollama is running, then pull the required models:
   ```bash
   ollama pull phi3:mini
   ollama pull qwen3-vl:4b
   ```

4. **(Optional) Environment Variables**
   Create a `.env` file if you plan to use Cloud fallbacks (Groq), otherwise, it runs locally by default.
   ```bash
   # GROQ_API_KEY=your_key_here (Optional)
   ```

## 🏃 Running the Application

Start the backend server:
```bash
python api.py
```

- **Instructor Dashboard**: Visit `http://127.0.0.1:8000/static/instructor.html`
- **API Docs**: Visit `http://127.0.0.1:8000/docs`

## 📚 Usage Guide

### For Instructors
1. Go to the **Courses** panel and create a new Course Bot (e.g., "Grade 10 Science").
2. Switch to **Content** and upload your PDF textbooks.
   - *Note: The system will automatically OCR scanned pages.*
3. Use the **Simulator** to test the bot's responses.
4. Monitor usage in the **Analytics** tab.

### For Students
(Student portal is currently under development. Use the Simulator for testing.)

## 📁 Project Structure

```
rag-lms/
├── api.py                 # Main FastAPI backend
├── utils.py               # PDF processing, OCR, and TOC extraction
├── vectorstore.py         # RAG logic (FAISS, Embeddings)
├── database.py            # SQLite database for chat history
├── static/                # Frontend Assets
│   ├── instructor.html    # Dashboard UI
│   ├── css/               # Styles
│   └── js/                # Frontend Logic
├── fin_ed_docs/           # PDF Storage
└── rag_lms.db             # Local Database
```

## � Roadmap

- [x] **Core RAG**: Text extraction, Chunking, Vector Search
- [x] **Advanced Ingestion**: TOC detection, OCR for scanned docs
- [x] **Local LLM Support**: Phi-3-Mini integration
- [x] **Instructor Dashboard**: Course & Content management
- [ ] **Student Portal**: Dedicated login and view for students
- [ ] **User Auth**: Secure login for Admin/Teachers/Students

## 📄 License

MIT License

## 👥 Contributors

- **Prashanna** - Lead Developer

---
**Status**: Active Development | **Version**: 0.2.0 | **Last Updated**: December 2025
