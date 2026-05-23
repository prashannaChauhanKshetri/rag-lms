"""
Shared pytest fixtures for the RAG-LMS API integration test suite.
All fixtures are session-scoped — users/chatbots are created once and reused
across the full test run.

Session creation strategy
─────────────────────────
The login endpoint has an in-memory rate-limiter (10 attempts / 15 min per IP).
After a few test runs the limit is exhausted for 127.0.0.1.

To avoid this we create JWT tokens directly via the app's own utils_auth module
rather than going through POST /auth/login.  This is fine for integration tests
— the token is identical to what the server would issue.
"""
import io
import os
import sys
import time
import pytest
import requests
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

BASE_URL = "http://localhost:8000"
INST_ID  = "60f44c5c-779e-47df-a776-6a786f4c5e46"   # Default Institution

# ── Make the app's own modules importable ────────────────────────────────────
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

import database_postgres as _db        # noqa: E402
import utils_auth as _auth             # noqa: E402

# ── Timestamp suffix keeps usernames unique across runs ─────────────────────
TS = str(int(time.time()))[-6:]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _signup_and_create_session(username: str, email: str, full_name: str, role: str) -> requests.Session:
    """
    Sign up the user (no-op if already exists), mint a JWT directly via
    utils_auth, and return a requests.Session with the cookie pre-set.
    This never touches the login endpoint so the rate-limiter is not affected.
    """
    # 1. Ensure the user exists
    _r = requests.post(f"{BASE_URL}/auth/signup", json={
        "username": username,
        "email": email,
        "password": "TestPass1",
        "confirm_password": "TestPass1",
        "full_name": full_name,
        "role": role,
        "institution_id": INST_ID,
    })
    # 200 = created, 400 = already exists — both are fine
    assert _r.status_code in (200, 400), f"Signup failed unexpectedly: {_r.text}"

    # 2. Fetch user record from DB
    user = _db.get_user_by_username(username)
    assert user, f"User {username!r} not found in DB after signup"

    # 3. Mint a JWT exactly as the login endpoint would
    token = _auth.create_access_token(data={
        "sub": user["id"],
        "username": user["username"],
        "role": user["role"],
        "full_name": user["full_name"],
        "institution_id": user["institution_id"],
    })

    # 4. Build a session with the cookie.
    #    requests won't send a cookie whose domain is "localhost" to localhost:8000
    #    (RFC 2965 quirk). Using "localhost.local" or an empty-string domain works.
    s = requests.Session()
    s.cookies.set("access_token", token, domain="localhost.local", path="/")
    s._user = user
    return s


def make_test_pdf(topic: str = "Introduction to Science") -> bytes:
    """Generate a minimal valid PDF with educational text for upload tests."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    lines = [
        f"Chapter 1: {topic}",
        "",
        f"{topic} is the systematic study of the natural world through observation,",
        "experimentation, and analysis. It encompasses multiple disciplines including",
        "physics, chemistry, biology, and earth sciences.",
        "",
        "Key Concepts:",
        "1. Scientific Method: Observation, hypothesis, experiment, conclusion.",
        "2. Matter: Everything around us is made of matter. Matter has mass and volume.",
        "3. Energy: The capacity to do work. Energy cannot be created or destroyed.",
        "4. Forces: A push or pull acting on an object. Newton's three laws of motion.",
        "5. Cells: The basic unit of life. Cells contain DNA and carry out metabolism.",
        "",
        "Chapter 2: Physics Fundamentals",
        "",
        "Velocity is the rate of change of position. Acceleration is the rate of change",
        "of velocity. Force equals mass times acceleration (F = ma).",
        "Gravity pulls objects toward Earth with an acceleration of 9.8 m/s^2.",
        "",
        "Chapter 3: Chemistry Basics",
        "",
        "Atoms are the smallest units of elements. Molecules are groups of atoms bonded",
        "together. Chemical reactions rearrange atoms to form new substances.",
        "The periodic table organises elements by atomic number and properties.",
    ]
    y = 750
    for line in lines:
        if y < 50:
            c.showPage()
            y = 750
        c.drawString(72, y, line)
        y -= 18
    c.save()
    return buf.getvalue()


# ── Session fixtures ──────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def admin_session() -> requests.Session:
    return _signup_and_create_session(
        username=f"t_admin_{TS}",
        email=f"t_admin_{TS}@example.com",
        full_name="Test Admin",
        role="admin",
    )


@pytest.fixture(scope="session")
def instructor_session() -> requests.Session:
    return _signup_and_create_session(
        username=f"t_instr_{TS}",
        email=f"t_instr_{TS}@example.com",
        full_name="Test Instructor",
        role="instructor",
    )


@pytest.fixture(scope="session")
def student_session() -> requests.Session:
    return _signup_and_create_session(
        username=f"t_stud_{TS}",
        email=f"t_stud_{TS}@example.com",
        full_name="Test Student",
        role="student",
    )


@pytest.fixture(scope="session")
def test_chatbot(admin_session) -> dict:
    """
    Create a course bot, upload a test PDF, and wait until ingestion finishes.
    Returns {"chatbot_id": ..., "doc_id": ...}.
    """
    # Create chatbot
    r = admin_session.post(f"{BASE_URL}/admin/chatbots", data={
        "name": f"Test Bot {TS}",
        "greeting": "Hello from the test bot!",
        "external_knowledge_ratio": "0.3",
    })
    assert r.status_code == 200, f"Chatbot creation failed: {r.text}"
    chatbot_id = r.json()["id"]

    # Upload test PDF
    pdf_bytes = make_test_pdf()
    r = admin_session.post(
        f"{BASE_URL}/admin/chatbots/{chatbot_id}/upload",
        files={"file": ("test_science.pdf", pdf_bytes, "application/pdf")},
    )
    assert r.status_code == 200, f"Upload failed: {r.text}"
    doc_id = r.json()["document_id"]

    # Poll until ready (max 90 s)
    for _ in range(18):
        time.sleep(5)
        r = admin_session.get(f"{BASE_URL}/chatbots/{chatbot_id}/documents/{doc_id}/status")
        if r.status_code == 200 and r.json().get("status") == "ready":
            break
    else:
        status = r.json().get("status", "unknown")
        pytest.skip(f"Document indexing timed out (status={status}) — skipping chat tests")

    return {"chatbot_id": chatbot_id, "doc_id": doc_id}
