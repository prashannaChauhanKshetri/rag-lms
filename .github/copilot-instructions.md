# RAG-LMS — Copilot / AI Agent Instructions

Purpose: give an AI coding assistant the exact, actionable context to make safe, useful changes fast.

## Quick architecture (what to know first) ✅
- Backend: FastAPI (entry: `api.py`) with modular routers in `routes/` (auth, admin, instructor, student, chat, chatbots).
- Frontend: Vite + React + TypeScript in `frontend/`. Dev: `cd frontend && npm run dev`. Build: `npm run build`.
- Data: PostgreSQL 17+ with `pgvector` (vector column size 384). See `setup_postgres.sql` (creates `hybrid_search` function used by `vectorstore_postgres.hybrid_query`).
- Embeddings: SentenceTransformers `all-MiniLM-L6-v2` (384 dims) lazy-loaded in `models.py`.
- LLM: Groq chat endpoint used via `routes/chat.call_groq_llm()` — requires `GROQ_API_KEY` env var.
- File serving: built frontend or static pages live in `static/` (API serves `static/login.html`, etc.); uploaded assignments go to `uploads/`.

## Dev setup & common commands (run these) 🔧
- DB: install pgvector, run SQL: `bash init_database.sh` (runs `setup_postgres.sql`).
- Backend: create venv, install: `python -m venv env && source env/bin/activate && pip install -r requirements.txt` then `python api.py` (or `uvicorn api:app --reload`).
- Frontend: `cd frontend && npm install && npm run dev` (or `npm run build` to produce production assets to place into `static/`).

## Important environment variables
- POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
- GROQ_API_KEY (LLM) — if missing, the app returns a helpful message.
- JWT_SECRET_KEY (auth)
- Note: `models.py` sets `TOKENIZERS_PARALLELISM=false` to avoid tokenizers deadlocks on startup.

## Project-specific conventions & gotchas ⚠️
- Hybrid retrieval: always prefer `vectorstore_postgres.hybrid_query()` (combines BM25 + vector). The DB function `hybrid_search` (in `setup_postgres.sql`) must exist and use a 384 vector column.
- Embedding dimension MUST be 384 (see `vectorstore_postgres.EMBEDDING_DIM`) — changing embedding model requires DB schema changes.
- DB access pattern: use `get_db_connection()` context manager and `get_dict_cursor(conn)` for selects (ensures commits/rollbacks and RealDictCursor).
- Auth: cookie JWT dependency `Depends(utils_auth.get_current_user)` is applied at router level; legacy SHA256 hashed demo users are created by `database_postgres.create_demo_users()` and `utils_auth.verify_password` supports a SHA256 fallback.
- Question type mapping: `very_short_answer` is mapped to `short_answer` in `routes/instructor.py` to satisfy DB CHECK constraint.
- LLM output is often noisy; existing code implements robust JSON extraction (e.g., `generate_questions_endpoint` finds first `{...}` block and attempts corrections) — follow that pattern when adding new LLM-backed features.

## Integration points & where to look for examples 📌
- LLM usage and prompt patterns: `routes/chat.py` and `routes/instructor.py` (look at `call_groq_llm()`, prompt composition, and post-processing).
- Vector + storage: `vectorstore_postgres.py` (insert/search/feedback) and SQL in `setup_postgres.sql` (vector index + `hybrid_search`).
- PDF processing & TOC-aware chunking: `utils.py` (Docling fallback, Tesseract OCR, chunking heuristics).
- Auth & tokens: `utils_auth.py` (JWT, cookie-based sessions).

## Contribution tips (make changes safely) ✅
- Add migrations or SQL changes to `setup_postgres.sql` and document index/extension requirements (pgvector, ivfflat tuning).
- When adding endpoints, follow existing patterns: small focused routers, clear pydantic models, `HTTPException` semantics, and logging.
- For features that call LLMs, add robust parsing and safe fallbacks (do not assume perfectly formatted JSON from the model).
- Keep embedding usage centralized through `models.get_embed_model()` and `vectorstore_postgres` helpers.

## Course Management (Sections, Attendance, Assignments, Resources) 📚
- **DB tables**: `sections` (course divisions), `enrollments` (student ↔ section), `attendance` (daily marks), `assignments` (teacher-created tasks), `assignment_submissions` (student work + grades), `resources` (shared files/links).
- **Teacher (instructor) endpoints**:
  - POST `/instructor/sections` — create section (teacher only)
  - GET `/instructor/sections/{chatbot_id}` — list sections for course
  - POST `/instructor/sections/{section_id}/enroll` — add student
  - POST `/instructor/sections/{section_id}/attendance` — bulk mark attendance (present/absent/late/excused)
  - POST `/instructor/sections/{section_id}/assignments` — create assignment
  - POST `/instructor/assignments/{assignment_id}/publish` — publish to students
  - GET `/instructor/assignments/{assignment_id}/submissions` — view student work
  - POST `/instructor/submissions/{submission_id}/grade` — score & feedback
  - POST `/instructor/sections/{section_id}/resources` — upload/link resources
- **Student (student) endpoints**:
  - GET `/student/sections` — list enrolled courses
  - GET `/student/sections/{section_id}` — view overview (attendance %, assignments, resources)
  - GET `/student/sections/{section_id}/attendance` — personal attendance record
  - POST `/student/sections/{section_id}/assignments/{assignment_id}/submit` — submit work
  - GET `/student/sections/{section_id}/resources` — download/view shared materials
- **Auth**: Instructor can only manage their own sections; students see only enrolled sections. DB constraints ensure unique attendance per day per student.
- **UI components** (responsive, mobile-friendly, Tailwind):
  - `AttendanceManager.tsx` (instructor) — date picker, student list, toggle buttons for status, bulk save
  - `CourseOverview.tsx` (student) — tabbed view (assignments, resources, attendance %, course info), cards with stats

## Tests & validation
- Manually test: create section → enroll students → mark attendance → create assignment → student submits → grade submission.
- Validate: only section teacher can mark attendance; students cannot see other sections; attendance uniqueness enforced by DB.
- Frontend: test responsive design on mobile (375px width), tablet (768px), and desktop (1024px+).

---
If any areas are unclear or you need examples (API payloads, SQL snippets), tell me which section. 🚀
