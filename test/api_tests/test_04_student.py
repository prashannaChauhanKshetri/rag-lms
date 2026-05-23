"""
Step 4 — Student Workflow Tests
Tests: student dashboard stats, sections/courses, quiz taking,
       assignment submission, progress timeline, grades, access control.

Note: Tests use pre-existing chatbots (SCI9_ID) to avoid upload/indexing wait.
      Empty-data responses are expected for a brand-new student — tests verify
      shape and status codes, not data volume.
      Backend bugs documented inline:
        - GET /student/assignments/pending returns 500 when db method fails
        - GET /student/assignments/{id} wraps 404 as 500 (HTTPException caught by bare except)
"""
import pytest
import requests as req

from .conftest import BASE_URL

# Pre-existing chatbot: Science Grade 9 (264 chunks, always ready)
SCI9_ID = "3bfcafa8-dcea-4182-98b9-1c9a00655baa"


# ── Dashboard & Stats ─────────────────────────────────────────────────────────

class TestStudentDashboard:
    def test_student_stats(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/stats")
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, dict)
        # Shape check — all numeric stat keys
        for key in ("total_enrollments", "active_assignments", "completed_assignments", "overall_grade"):
            assert key in body, f"Missing key: {key}"

    def test_student_progress(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/progress")
        assert r.status_code == 200

    def test_student_progress_timeline(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/progress/timeline")
        assert r.status_code == 200

    def test_student_grades(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/grades")
        assert r.status_code == 200
        body = r.json()
        # Shape: {"assignments": [...], "stats": {...}}
        assert "assignments" in body
        assert "stats" in body
        stats = body["stats"]
        for key in ("total_graded", "average_grade", "highest_grade", "lowest_grade"):
            assert key in stats, f"Missing stats key: {key}"

    def test_stats_unauthenticated_is_401(self):
        r = req.get(f"{BASE_URL}/student/stats")
        assert r.status_code == 401


# ── Sections & Courses ────────────────────────────────────────────────────────

class TestStudentSections:
    def test_list_sections(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/sections")
        assert r.status_code == 200
        body = r.json()
        assert "sections" in body
        assert isinstance(body["sections"], list)

    def test_list_resources(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/resources")
        assert r.status_code == 200

    def test_sections_unauthenticated_is_401(self):
        r = req.get(f"{BASE_URL}/student/sections")
        assert r.status_code == 401

    def test_section_detail_invalid_id(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/sections/99999999")
        assert r.status_code in (403, 404, 422)


# ── Assignments ───────────────────────────────────────────────────────────────

class TestStudentAssignments:
    def test_list_assignments(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/assignments")
        assert r.status_code == 200
        body = r.json()
        assert "assignments" in body
        assert isinstance(body["assignments"], list)

    def test_pending_assignments(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/assignments/pending")
        assert r.status_code == 200
        body = r.json()
        assert "assignments" in body

    def test_assignment_detail_not_found(self, student_session):
        r = student_session.get(
            f"{BASE_URL}/student/assignments/00000000-0000-0000-0000-000000000000"
        )
        assert r.status_code in (403, 404)


# ── Quizzes ───────────────────────────────────────────────────────────────────

class TestStudentQuizzes:
    def test_quizzes_for_chatbot(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/quizzes/{SCI9_ID}")
        assert r.status_code == 200
        body = r.json()
        assert "quizzes" in body
        assert isinstance(body["quizzes"], list)

    def test_flashcards_for_chatbot(self, student_session):
        r = student_session.get(f"{BASE_URL}/student/flashcards/{SCI9_ID}")
        assert r.status_code == 200
        body = r.json()
        assert "flashcards" in body
        assert isinstance(body["flashcards"], list)

    def test_take_quiz_not_found(self, student_session):
        r = student_session.get(
            f"{BASE_URL}/student/quizzes/00000000-0000-0000-0000-000000000000/take"
        )
        assert r.status_code in (403, 404)

    def test_submit_quiz_unknown_quiz_is_error(self, student_session):
        r = student_session.post(f"{BASE_URL}/student/quizzes/submit", json={
            "quiz_id": "00000000-0000-0000-0000-000000000000",
            "answers": {},
        })
        assert r.status_code in (400, 403, 404, 422, 500)

    def test_quizzes_unauthenticated_is_401(self):
        r = req.get(f"{BASE_URL}/student/quizzes/{SCI9_ID}")
        assert r.status_code == 401


# ── Full Quiz Take + Submit Flow ──────────────────────────────────────────────

class TestStudentQuizFlow:
    """
    Creates a quiz (as admin/instructor) using SCI9_ID, publishes it, then
    has the student take + submit it.  Uses class-level state to chain tests.
    """
    _quiz_id = None
    _submission_id = None

    def test_setup_published_quiz(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/instructor/quizzes/create", json={
            "chatbot_id": SCI9_ID,
            "title": "Student Flow Quiz",
            "description": "Auto-generated for testing",
            "questions": [
                {
                    "question_type": "mcq",
                    "question_text": "What is the unit of force?",
                    "options": ["Newton", "Joule", "Watt", "Pascal"],
                    "correct_answer": "Newton",
                    "points": 1,
                },
            ],
        })
        assert r.status_code == 200, f"Quiz create failed: {r.text}"
        body = r.json()
        qid = body.get("quiz_id") or body.get("id")
        assert qid, f"No quiz_id in response: {body}"
        TestStudentQuizFlow._quiz_id = qid

    def test_quiz_is_published_by_default(self, student_session):
        """Quiz create sets is_published=True by default — student should see it."""
        qid = TestStudentQuizFlow._quiz_id
        if not qid:
            pytest.skip("No quiz_id from setup step")
        r = student_session.get(f"{BASE_URL}/student/quizzes/{SCI9_ID}")
        assert r.status_code == 200
        ids = [q.get("id") or q.get("quiz_id") for q in r.json().get("quizzes", [])]
        assert qid in ids, f"Quiz {qid!r} not found in student's quiz list"

    def test_student_take_quiz(self, student_session):
        qid = TestStudentQuizFlow._quiz_id
        if not qid:
            pytest.skip("No quiz_id from setup step")
        r = student_session.get(f"{BASE_URL}/student/quizzes/{qid}/take")
        assert r.status_code == 200
        body = r.json()
        assert "questions" in body or "quiz" in body

    def test_student_submit_quiz(self, student_session):
        qid = TestStudentQuizFlow._quiz_id
        if not qid:
            pytest.skip("No quiz_id from setup step")
        r = student_session.post(f"{BASE_URL}/student/quizzes/submit", json={
            "quiz_id": qid,
            "answers": {},
        })
        assert r.status_code in (200, 201), f"Submit failed: {r.text}"
        body = r.json()
        assert "submission_id" in body, f"No submission_id in: {body}"
        assert "result_status" in body
        TestStudentQuizFlow._submission_id = body["submission_id"]

    def test_submission_result_pending_until_published(self, student_session):
        sid = TestStudentQuizFlow._submission_id
        if not sid:
            pytest.skip("No submission_id from submit step")
        r = student_session.get(f"{BASE_URL}/student/quizzes/submissions/{sid}/result")
        assert r.status_code == 200
        body = r.json()
        assert body.get("result_status") in ("pending_review", "pending_publish", "published")

    def test_other_user_cannot_see_submission(self, instructor_session):
        """Instructor does NOT own the submission → must get 403."""
        sid = TestStudentQuizFlow._submission_id
        if not sid:
            pytest.skip("No submission_id from submit step")
        r = instructor_session.get(f"{BASE_URL}/student/quizzes/submissions/{sid}/result")
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"
