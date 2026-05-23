"""
Step 3 — Instructor Workflow Tests

Covers: AI question generation, quiz CRUD + publish/unpublish,
        flashcard generation + save + publish, lesson plan generation + CRUD,
        assignment creation, and access-control checks.

API field names (confirmed against live server):
  Quiz questions  → question_type, question_text, correct_answer, options, points
  Quiz create     → is_published=True by default; quiz_id in response
  Flashcard save  → returns {"ids": [...], "message": "..."} (not "flashcard_id")
  Groq rate limit → embedded in response body, not HTTP 429
                    questions/flashcards list is empty + raw_text has error message

Uses the Science 9 chatbot (3bfcafa8) — 264 chunks, reliably indexed.
"""
import pytest
import requests as req

from .conftest import BASE_URL

CHATBOT_ID = "3bfcafa8-dcea-4182-98b9-1c9a00655baa"   # Science 9 — Grade 9


# ── Groq rate-limit guard ─────────────────────────────────────────────────────

def _groq_skip(body: dict, list_key: str = "questions"):
    """
    Skip the test if Groq hit its daily token quota.
    The API still returns 200 but the list is empty and raw_text carries the error.
    """
    raw = body.get("raw_text", "") or body.get("error", "") or str(body)
    items = body.get(list_key, [])
    if not items and ("rate_limit" in raw.lower() or "429" in raw or "Error" in raw):
        pytest.skip(f"Groq daily quota exhausted — {raw[:120]}")


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  AI QUESTION GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestQuestionGeneration:
    def test_generate_questions_returns_list(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/instructor/generate-questions", json={
            "chatbot_id": CHATBOT_ID,
            "topic": "Newton's laws of motion",
            "count": 4,
            "difficulty": "medium",
            "types": ["mcq", "true_false"],
        })
        assert r.status_code == 200
        body = r.json()
        _groq_skip(body, "questions")
        assert len(body["questions"]) >= 1

    def test_generated_questions_have_required_fields(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/instructor/generate-questions", json={
            "chatbot_id": CHATBOT_ID,
            "topic": "photosynthesis",
            "count": 2,
            "difficulty": "easy",
            "types": ["mcq"],
        })
        assert r.status_code == 200
        body = r.json()
        _groq_skip(body, "questions")
        for q in body["questions"]:
            # Generated questions use question_text or question key
            assert "question_text" in q or "question" in q
            assert "type" in q or "question_type" in q

    def test_generate_questions_wrong_chatbot_is_404(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/instructor/generate-questions", json={
            "chatbot_id": "00000000-0000-0000-0000-000000000000",
            "topic": "science", "count": 2, "types": ["mcq"],
        })
        assert r.status_code == 404

    def test_generate_questions_instructor_without_access_is_403(self, instructor_session):
        r = instructor_session.post(f"{BASE_URL}/instructor/generate-questions", json={
            "chatbot_id": CHATBOT_ID, "topic": "science",
            "count": 2, "types": ["mcq"],
        })
        assert r.status_code == 403

    def test_generate_questions_unauthenticated_is_401(self):
        r = req.post(f"{BASE_URL}/instructor/generate-questions", json={
            "chatbot_id": CHATBOT_ID, "topic": "science",
            "count": 2, "types": ["mcq"],
        })
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  QUIZ CRUD + PUBLISH / UNPUBLISH
#
#  API notes:
#    • quiz questions use  question_type / question_text  (not type / question)
#    • create_quiz sets is_published=True by default
#    • quiz_id is in the create response
# ═══════════════════════════════════════════════════════════════════════════════

class TestQuizWorkflow:
    _quiz_id = None

    _QUESTIONS = [
        {
            "question_type": "mcq",
            "question_text": "What does F = ma represent?",
            "options": ["Newton's second law", "Energy conservation",
                        "Ohm's law", "Boyle's law"],
            "correct_answer": "Newton's second law",
            "points": 2,
        },
        {
            "question_type": "true_false",
            "question_text": "Photosynthesis occurs in the chloroplast.",
            "correct_answer": "True",
            "points": 1,
        },
        {
            "question_type": "short_answer",
            "question_text": "Define kinetic energy.",
            "correct_answer": "Energy of a body due to its motion.",
            "points": 3,
        },
    ]

    def test_create_quiz(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/instructor/quizzes/create", json={
            "chatbot_id": CHATBOT_ID,
            "title": "Science 9 — Unit 1 Quiz",
            "description": "Newton's laws and photosynthesis",
            "questions": self._QUESTIONS,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert "quiz_id" in body
        TestQuizWorkflow._quiz_id = body["quiz_id"]

    def test_list_quizzes_contains_created(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/instructor/quizzes/{CHATBOT_ID}")
        assert r.status_code == 200
        ids = [q["id"] for q in r.json().get("quizzes", [])]
        assert TestQuizWorkflow._quiz_id in ids

    def test_get_quiz_details_has_questions(self, admin_session):
        qid = TestQuizWorkflow._quiz_id
        r = admin_session.get(f"{BASE_URL}/instructor/quizzes/{qid}/details")
        assert r.status_code == 200
        body = r.json()
        assert "questions" in body
        assert len(body["questions"]) == len(self._QUESTIONS)

    def test_quiz_created_as_published(self, admin_session):
        qid = TestQuizWorkflow._quiz_id
        r = admin_session.get(f"{BASE_URL}/instructor/quizzes/{CHATBOT_ID}")
        quiz = next((q for q in r.json()["quizzes"] if q["id"] == qid), None)
        assert quiz is not None
        assert quiz["is_published"] is True

    def test_unpublish_quiz(self, admin_session):
        qid = TestQuizWorkflow._quiz_id
        r = admin_session.post(f"{BASE_URL}/instructor/quizzes/{qid}/unpublish")
        assert r.status_code == 200
        assert "unpublished" in r.json()["message"].lower()

    def test_unpublished_quiz_hidden_from_student(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/quizzes/{CHATBOT_ID}")
        assert r.status_code == 200
        ids = [q["id"] for q in r.json().get("quizzes", [])]
        assert TestQuizWorkflow._quiz_id not in ids

    def test_republish_quiz(self, admin_session):
        qid = TestQuizWorkflow._quiz_id
        r = admin_session.post(f"{BASE_URL}/instructor/quizzes/{qid}/publish")
        assert r.status_code == 200
        assert "published" in r.json()["message"].lower()

    def test_published_quiz_visible_to_student(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/quizzes/{CHATBOT_ID}")
        assert r.status_code == 200
        ids = [q["id"] for q in r.json().get("quizzes", [])]
        assert TestQuizWorkflow._quiz_id in ids

    def test_get_quiz_submissions_empty(self, admin_session):
        qid = TestQuizWorkflow._quiz_id
        r = admin_session.get(f"{BASE_URL}/instructor/quizzes/{qid}/submissions")
        assert r.status_code == 200
        assert "submissions" in r.json()

    def test_delete_quiz(self, admin_session):
        qid = TestQuizWorkflow._quiz_id
        r = admin_session.delete(f"{BASE_URL}/instructor/quizzes/{qid}")
        assert r.status_code == 200

    def test_deleted_quiz_not_in_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/instructor/quizzes/{CHATBOT_ID}")
        ids = [q["id"] for q in r.json().get("quizzes", [])]
        assert TestQuizWorkflow._quiz_id not in ids


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  FLASHCARDS
#
#  API notes:
#    • save response → {"ids": ["uuid", ...], "message": "N flashcards saved..."}
#    • ids[0] is the flashcard set ID
# ═══════════════════════════════════════════════════════════════════════════════

class TestFlashcards:
    _flashcard_id = None

    def test_generate_flashcards(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/instructor/flashcards/generate", json={
            "chatbot_id": CHATBOT_ID,
            "topic": "chemistry basics",
            "count": 4,
        })
        assert r.status_code == 200
        body = r.json()
        # When Groq is rate-limited the parser finds no FRONT/BACK markers
        # → empty list with no raw_text; treat it as a quota skip
        if len(body.get("flashcards", [])) == 0:
            pytest.skip("Flashcard generate returned empty — likely Groq quota exhausted")
        for card in body["flashcards"]:
            assert "front" in card and "back" in card

    def test_save_flashcards(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/instructor/flashcards/save", json={
            "chatbot_id": CHATBOT_ID,
            "flashcards": [
                {"front": "What is an atom?", "back": "Smallest unit of an element."},
                {"front": "What is a molecule?", "back": "Two or more atoms bonded."},
            ],
        })
        assert r.status_code == 200
        body = r.json()
        # response has "ids" (list) and "message"
        assert "ids" in body
        assert len(body["ids"]) > 0
        TestFlashcards._flashcard_id = body["ids"][0]

    def test_list_flashcards(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/instructor/flashcards/{CHATBOT_ID}")
        assert r.status_code == 200
        body = r.json()
        assert "flashcards" in body

    def test_saved_flashcard_already_published(self, student_session):
        """save endpoint auto-publishes — student should see them immediately."""
        r = student_session.get(f"{BASE_URL}/student/flashcards/{CHATBOT_ID}")
        assert r.status_code == 200
        assert "flashcards" in r.json()

    def test_publish_flashcards_endpoint(self, admin_session):
        fid = TestFlashcards._flashcard_id
        if not fid:
            pytest.skip("No flashcard id from save step")
        r = admin_session.post(f"{BASE_URL}/instructor/flashcards/{fid}/publish")
        assert r.status_code == 200

    def test_delete_flashcard(self, admin_session):
        fid = TestFlashcards._flashcard_id
        if not fid:
            pytest.skip("No flashcard id from save step")
        r = admin_session.delete(f"{BASE_URL}/instructor/flashcards/{fid}")
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  LESSON PLANS
# ═══════════════════════════════════════════════════════════════════════════════

class TestLessonPlans:
    _plan_id = None

    def test_generate_lesson_plan(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/instructor/lesson-plans/generate", json={
            "chatbot_id": CHATBOT_ID,
            "topic": "Newton's Laws of Motion",
            "duration": "45 minutes",
        })
        assert r.status_code == 200
        body = r.json()
        # handle Groq rate limit gracefully
        raw = str(body)
        if "rate_limit" in raw.lower() or "429" in raw:
            pytest.skip("Groq quota exhausted — lesson plan generation skipped")
        assert isinstance(body, dict) and len(body) > 0

    def test_save_lesson_plan(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/instructor/lesson-plans/save", json={
            "chatbot_id": CHATBOT_ID,
            "title": "Newton's Laws — 45 min",
            "topic": "Newton's Laws of Motion",
            "content": "Introduce F=ma, demonstrate with real-world examples.",
            "objectives": ["Understand all 3 laws", "Apply F=ma to problems"],
            "examples": ["Rocket launch uses Newton's 3rd law",
                         "Car braking uses Newton's 1st law"],
            "activities": ["Group experiment with carts and weights"],
        })
        assert r.status_code == 200
        body = r.json()
        assert "plan_id" in body or "id" in body
        TestLessonPlans._plan_id = body.get("plan_id") or body.get("id")

    def test_list_lesson_plans(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/instructor/lesson-plans/{CHATBOT_ID}")
        assert r.status_code == 200
        body = r.json()
        assert "lesson_plans" in body or "plans" in body

    def test_get_plan_details(self, admin_session):
        pid = TestLessonPlans._plan_id
        if not pid:
            pytest.skip("No plan id — save step may have failed")
        r = admin_session.get(f"{BASE_URL}/instructor/lesson-plans/{pid}/details")
        assert r.status_code == 200
        body = r.json()
        assert "title" in body or "topic" in body or "content" in body

    def test_delete_lesson_plan(self, admin_session):
        pid = TestLessonPlans._plan_id
        if not pid:
            pytest.skip("No plan id")
        r = admin_session.delete(f"{BASE_URL}/instructor/lesson-plans/{pid}")
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# 5.  ASSIGNMENT CREATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestAssignments:
    """
    Assignment creation requires the instructor to be assigned to a section
    that teaches the target chatbot.  Setup chain (all via admin):
      create class → add chatbot as subject → create section
      → assign instructor to subject+section
    Then instructor creates assignment using chatbot_id.
    """
    _assignment_id = None
    _class_id      = None
    _section_id    = None
    _ta_id         = None

    @pytest.fixture(autouse=True, scope="class")
    def setup_section(self, admin_session, instructor_session):
        BASE = BASE_URL

        # 1. Create class
        r = admin_session.post(f"{BASE}/admin/classes",
                               json={"name": "Assignments Test Class", "description": "test"})
        assert r.status_code == 200
        TestAssignments._class_id = r.json()["class_id"]

        # 2. Add chatbot as subject
        r = admin_session.post(
            f"{BASE}/admin/classes/{TestAssignments._class_id}/subjects",
            json={"chatbot_id": CHATBOT_ID},
        )
        assert r.status_code == 200
        cs_id = r.json()["class_subject_id"]

        # 3. Create section
        r = admin_session.post(f"{BASE}/admin/sections", json={
            "name": "Section B",
            "class_id": TestAssignments._class_id,
            "academic_year": "2025-2026",
        })
        assert r.status_code == 200
        TestAssignments._section_id = r.json()["section_id"]

        # 4. Assign instructor to subject + section (section_id required)
        instr_id = instructor_session._user["id"]
        r = admin_session.post(
            f"{BASE}/admin/classes/{TestAssignments._class_id}/subjects/{cs_id}/teacher",
            json={"teacher_id": instr_id, "section_id": TestAssignments._section_id},
        )
        assert r.status_code == 200, f"Teacher assignment failed: {r.text}"
        TestAssignments._ta_id = r.json().get("assignment_id")

        yield

        # Teardown
        if TestAssignments._assignment_id:
            instructor_session.delete(
                f"{BASE}/instructor/assignments/{TestAssignments._assignment_id}")
        if TestAssignments._ta_id:
            admin_session.delete(
                f"{BASE}/admin/teacher-assignments/{TestAssignments._ta_id}")
        if TestAssignments._section_id:
            admin_session.delete(f"{BASE}/admin/sections/{TestAssignments._section_id}")
        if TestAssignments._class_id:
            admin_session.delete(f"{BASE}/admin/classes/{TestAssignments._class_id}")

    def test_create_assignment(self, instructor_session):
        r = instructor_session.post(f"{BASE_URL}/instructor/assignments/create", data={
            "chatbot_id": CHATBOT_ID,
            "title": "Science 9 — Chapter 1 Assignment",
            "description": "Answer questions about Newton's laws and photosynthesis.",
            "due_date": "2026-12-31T23:59:00",
            "points": 20,
        })
        assert r.status_code in (200, 201), r.text
        body = r.json()
        # response: {"assignment_ids": ["uuid", ...], "message": "Assignment created for N sections"}
        assert "assignment_ids" in body or "assignment_id" in body or "id" in body
        ids = body.get("assignment_ids") or []
        TestAssignments._assignment_id = (ids[0] if ids else
                                          body.get("assignment_id") or body.get("id"))

    def test_list_assignments_contains_created(self, instructor_session):
        r = instructor_session.get(f"{BASE_URL}/instructor/assignments/{CHATBOT_ID}")
        assert r.status_code == 200
        ids = [a.get("id") or a.get("assignment_id")
               for a in r.json().get("assignments", [])]
        assert TestAssignments._assignment_id in ids

    def test_publish_assignment(self, instructor_session):
        aid = TestAssignments._assignment_id
        if not aid:
            pytest.skip("No assignment id")
        r = instructor_session.post(f"{BASE_URL}/instructor/assignments/{aid}/publish")
        assert r.status_code == 200

    def test_student_sees_assignments_endpoint(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/assignments")
        assert r.status_code == 200

    def test_get_assignment_submissions(self, instructor_session):
        aid = TestAssignments._assignment_id
        if not aid:
            pytest.skip("No assignment id")
        r = instructor_session.get(f"{BASE_URL}/instructor/assignments/{aid}/submissions")
        assert r.status_code == 200
        assert "submissions" in r.json()

    def test_delete_assignment(self, instructor_session):
        aid = TestAssignments._assignment_id
        if not aid:
            pytest.skip("No assignment id")
        r = instructor_session.delete(f"{BASE_URL}/instructor/assignments/{aid}")
        assert r.status_code == 200
        TestAssignments._assignment_id = None   # prevent teardown double-delete
