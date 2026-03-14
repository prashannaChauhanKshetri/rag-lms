import asyncio

import pytest
from fastapi import HTTPException

from routes import instructor, student


def test_instructor_quiz_submissions_forbidden_without_ownership(monkeypatch):
    monkeypatch.setattr(instructor.db, "get_quiz", lambda quiz_id: {"id": quiz_id, "chatbot_id": "chatbot-1"})
    monkeypatch.setattr(instructor.db, "list_teacher_teaching_units", lambda teacher_id: [{"chatbot_id": "chatbot-2"}])

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            instructor.get_quiz_submissions_endpoint(
                "quiz-1",
                user={"role": "instructor", "sub": "teacher-1"},
                status=None,
                published=None,
                student_id=None,
            )
        )

    assert exc.value.status_code == 403


def test_instructor_quiz_submissions_allows_filters_for_owner(monkeypatch):
    captured = {}

    monkeypatch.setattr(instructor.db, "get_quiz", lambda quiz_id: {"id": quiz_id, "chatbot_id": "chatbot-1"})
    monkeypatch.setattr(instructor.db, "list_teacher_teaching_units", lambda teacher_id: [{"chatbot_id": "chatbot-1"}])

    def fake_list(quiz_id, grading_status=None, is_result_published=None, student_id=None):
        captured["quiz_id"] = quiz_id
        captured["grading_status"] = grading_status
        captured["is_result_published"] = is_result_published
        captured["student_id"] = student_id
        return [{"id": "sub-1"}]

    monkeypatch.setattr(instructor.db, "list_quiz_submissions_for_review", fake_list)

    result = asyncio.run(
        instructor.get_quiz_submissions_endpoint(
            "quiz-1",
            user={"role": "instructor", "sub": "teacher-1"},
            status="reviewed",
            published=False,
            student_id="student-1",
        )
    )

    assert result == {"submissions": [{"id": "sub-1"}]}
    assert captured == {
        "quiz_id": "quiz-1",
        "grading_status": "reviewed",
        "is_result_published": False,
        "student_id": "student-1",
    }


def test_student_quiz_result_pending_until_published(monkeypatch):
    monkeypatch.setattr(
        student.db,
        "get_quiz_submission_by_id",
        lambda submission_id: {
            "id": submission_id,
            "student_id": "student-1",
            "is_result_published": False,
        },
    )

    result = asyncio.run(student.get_quiz_submission_result("sub-1", user={"sub": "student-1"}))

    assert result["result_status"] == "pending_publish"
    assert result["is_result_published"] is False


def test_student_quiz_result_forbidden_for_other_student(monkeypatch):
    monkeypatch.setattr(
        student.db,
        "get_quiz_submission_by_id",
        lambda submission_id: {
            "id": submission_id,
            "student_id": "student-owner",
            "is_result_published": True,
        },
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(student.get_quiz_submission_result("sub-1", user={"sub": "different-student"}))

    assert exc.value.status_code == 403


def test_student_quiz_result_returns_published_score_and_feedback(monkeypatch):
    monkeypatch.setattr(
        student.db,
        "get_quiz_submission_by_id",
        lambda submission_id: {
            "id": submission_id,
            "student_id": "student-1",
            "is_result_published": True,
            "display_score": 84.5,
            "score": 60.0,
            "manual_total_score": 84.5,
            "feedback": "Good structure and clear steps.",
            "published_at": "2026-03-14T10:00:00",
        },
    )

    result = asyncio.run(student.get_quiz_submission_result("sub-1", user={"sub": "student-1"}))

    assert result["result_status"] == "published"
    assert result["score"] == 84.5
    assert result["manual_total_score"] == 84.5
    assert result["feedback"] == "Good structure and clear steps."


def test_student_submit_quiz_uses_authenticated_user_id(monkeypatch):
    saved = {}

    monkeypatch.setattr(student.db, "get_quiz", lambda quiz_id: {"id": quiz_id, "is_published": True})
    monkeypatch.setattr(
        student.db,
        "get_quiz_questions",
        lambda quiz_id: [{"id": "q1", "points": 1, "correct_answer": "A"}],
    )

    def fake_submit(submission_id, quiz_id, student_id, answers, score):
        saved["submission_id"] = submission_id
        saved["quiz_id"] = quiz_id
        saved["student_id"] = student_id
        saved["answers"] = answers
        saved["score"] = score

    monkeypatch.setattr(student.db, "submit_quiz", fake_submit)

    request = student.SubmitQuizRequest(quiz_id="quiz-1", student_id="spoofed-id", answers={"q1": "A"})
    result = asyncio.run(student.submit_quiz_endpoint(request, user={"sub": "auth-student"}))

    assert saved["student_id"] == "auth-student"
    assert result["result_status"] == "pending_review"
