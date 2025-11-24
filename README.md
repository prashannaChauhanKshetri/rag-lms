# RAG-Based Learning Management System

A RAG (Retrieval Augmented Generation) powered educational platform for student learning and question answering from uploaded course materials.

## 🎯 Project Overview

This is a **Final Year Project (FYP)** for building an intelligent Learning Management System (LMS) that allows:
- **Teachers** to upload educational PDFs (textbooks, lecture notes)
- **Students** to ask questions and receive AI-powered answers with page citations
- **Administrators** to manage subjects and content

## 🚀 Features

- **Smart PDF Ingestion**: Automatically processes and chunks PDFs with page-level metadata
- **OCR Support**: Handles scanned PDFs using Tesseract OCR with parallel processing (4-core)
- **Hybrid Processing**: Extracts text directly when possible, falls back to OCR for scanned pages
- **Intelligent Search**: Uses FAISS vector search with local embeddings (MiniLM)
- **AI-Powered Answers**: Integrates with Groq LLM for accurate, context-aware responses
- **Page Citations**: Every answer includes specific page references from source materials
- **Subject Namespaces**: Organize content by subject for multi-course support
- **Web UI**: Simple browser interface for upload and chat
- **Chainlit Interface**: Developer-friendly chat UI for testing

**Performance**: Processes 200-page textbooks in ~80 seconds, generating 400-500 searchable chunks

## 🛠️ Tech Stack

### Backend
- **FastAPI** - High-performance API framework
- **LangChain** - Document processing and text splitting
- **FAISS** - Vector similarity search
- **Groq API** - Fast LLM inference (Llama 3.3 70B)
- **Sentence Transformers** - Local embeddings (all-MiniLM-L6-v2)
- **PyPDF** - PDF text extraction

### Frontend
- **HTML/CSS/JavaScript** - Simple web interface
- **Chainlit** - Interactive chat UI for development

## 📋 Prerequisites

- Python 3.11+
- Mac M1/M2 (optimized for Apple Silicon)
- Groq API key (free at https://console.groq.com)

## 🔧 Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd rag-lms
```

2. **Create virtual environment**
```bash
python3 -m venv env
source env/bin/activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Install Tesseract OCR (for scanned PDFs)**
```bash
# On macOS
brew install tesseract

# On Ubuntu/Debian
sudo apt-get install tesseract-ocr

# On Windows
# Download from: https://github.com/UB-Mannheim/tesseract/wiki
```

5. **Set up environment variables**
Create a `.env` file:
```bash
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

## 🏃 Running the Application

### Option 1: FastAPI Web Interface (Recommended for Production)

```bash
python api.py
```

Then visit: `http://127.0.0.1:8000`

### Option 2: Chainlit Developer Interface

```bash
chainlit run app.py -w
```

## 📚 Usage

### 1. Upload Documents

1. Navigate to the web interface
2. Enter a subject name (e.g., "physics", "chemistry")
3. Select a PDF file
4. Click "Upload & Ingest"
5. Wait for confirmation showing the number of chunks created

### 2. Ask Questions

1. Enter the same subject name used during upload
2. Type your question
3. Click "Ask"
4. Receive AI-generated answer with page citations

### Example

**Upload**: `grade-10-science-part-1.pdf` under subject `science`

**Question**: "What is Newton's first law?"

**Answer**: "Newton's first law states that an object at rest stays at rest and an object in motion stays in motion unless acted upon by an external force (Page 45)."

## 📁 Project Structure

```
rag-lms/
├── api.py                 # FastAPI backend
├── app.py                 # Chainlit chat interface
├── utils.py               # PDF processing & chunking
├── vectorstore.py         # FAISS index management
├── requirements.txt       # Python dependencies
├── .env                   # Environment variables (create this)
├── static/                # Web UI files
│   ├── index.html
│   └── app.js
├── fin_ed_docs/          # Uploaded PDFs storage
├── vectorstores/         # FAISS indexes (auto-created)
└── README.md
```

## 🔍 How It Works

1. **Ingestion Pipeline**
   - PDF uploaded → Text extracted page-by-page
   - Text split into ~1000 char chunks with 200 char overlap
   - Each chunk tagged with page number and source
   - Chunks embedded using MiniLM model (384 dimensions)
   - Embeddings stored in FAISS index per subject

2. **Question Answering**
   - User question → Embedded with same model
   - FAISS retrieves top-K similar chunks
   - Context + question sent to Groq LLM
   - LLM generates answer with page citations

## 🎓 Educational Context

This project is designed for:
- Grade 10-12 Science & Technology courses
- Large textbooks (200-300 pages each)
- Multiple subjects per semester
- Student self-study and exam preparation

## 🐛 Troubleshooting

### "Only 6 chunks created from large PDF"
- **Cause**: PDF contains scanned images, not text
- **Solution**: Use OCR-enabled PDF processing (future enhancement)

### "Segmentation fault on startup"
- **Cause**: Library incompatibility on Mac M1
- **Fix**: Already handled with lifespan events and TOKENIZERS_PARALLELISM=false

### "No answer returned"
- Verify subject name matches between upload and query
- Check if GROQ_API_KEY is set correctly
- Ensure documents were uploaded successfully

## 🚧 Roadmap

### Phase 1: Core RAG (✅ Complete)
- [x] PDF ingestion with chunking
- [x] Vector search
- [x] LLM integration
- [x] Page citations

### Phase 2: LMS Features (Planned)
- [ ] User authentication (Admin/Teacher/Student roles)
- [ ] Database integration (PostgreSQL/Supabase)
- [ ] Chat history per student
- [ ] Analytics dashboard
- [ ] Multi-tenant support

### Phase 3: Advanced Features (Future)
- [ ] OCR for scanned PDFs
- [ ] Semantic reranking
- [ ] Multi-modal support (images, diagrams)
- [ ] Gamification for students
- [ ] Mobile app

## 📄 License

MIT License - Feel free to use for educational purposes

## 👥 Contributors

- Prashanna - FYP Student

## 🙏 Acknowledgments

- Groq for free LLM API access
- LangChain community for RAG patterns
- Sentence Transformers for local embeddings

---

**Status**: Active Development | **Version**: 0.1.0 | **Last Updated**: November 2024
