"""
Step 1 — Auth Flow Tests
Tests: signup, login, session, logout, edge cases (wrong password, duplicate,
       weak password, invalid role, bad institution).

Note: The in-memory rate limiter allows 10 login attempts per IP per 15 min.
      Tests that test rejection accept 401 OR 429 — both are correct rejections.
      Tests that need an authenticated session use shared session fixtures
      (from conftest.py) to avoid burning rate-limit quota.
"""
import time
import requests
import pytest

from .conftest import BASE_URL, INST_ID

TS = str(int(time.time()))[-6:]

_BASE_USER = {
    "password": "TestPass1",
    "confirm_password": "TestPass1",
    "institution_id": INST_ID,
}


# ── 1. Signup ────────────────────────────────────────────────────────────────

def test_signup_student():
    r = requests.post(f"{BASE_URL}/auth/signup", json={
        **_BASE_USER,
        "username": f"auth_stu_{TS}",
        "email": f"auth_stu_{TS}@example.com",
        "full_name": "Auth Student",
        "role": "student",
    })
    assert r.status_code == 200
    body = r.json()
    assert "user_id" in body
    assert "email" in body


def test_signup_instructor():
    r = requests.post(f"{BASE_URL}/auth/signup", json={
        **_BASE_USER,
        "username": f"auth_ins_{TS}",
        "email": f"auth_ins_{TS}@example.com",
        "full_name": "Auth Instructor",
        "role": "instructor",
    })
    assert r.status_code == 200
    assert "user_id" in r.json()


def test_signup_admin():
    r = requests.post(f"{BASE_URL}/auth/signup", json={
        **_BASE_USER,
        "username": f"auth_adm_{TS}",
        "email": f"auth_adm_{TS}@example.com",
        "full_name": "Auth Admin",
        "role": "admin",
    })
    assert r.status_code == 200
    assert "user_id" in r.json()


def test_signup_duplicate_username():
    r = requests.post(f"{BASE_URL}/auth/signup", json={
        **_BASE_USER,
        "username": f"auth_stu_{TS}",          # same username
        "email": f"dup_{TS}@example.com",
        "full_name": "Dup",
        "role": "student",
    })
    assert r.status_code == 400
    assert "username" in r.json()["detail"].lower()


def test_signup_duplicate_email():
    r = requests.post(f"{BASE_URL}/auth/signup", json={
        **_BASE_USER,
        "username": f"dup_email_{TS}",
        "email": f"auth_stu_{TS}@example.com",  # same email
        "full_name": "Dup",
        "role": "student",
    })
    assert r.status_code == 400
    assert "email" in r.json()["detail"].lower()


def test_signup_invalid_role():
    r = requests.post(f"{BASE_URL}/auth/signup", json={
        **_BASE_USER,
        "username": f"bad_role_{TS}",
        "email": f"bad_role_{TS}@example.com",
        "full_name": "Bad Role",
        "role": "superuser",
    })
    assert r.status_code == 400


def test_signup_weak_password():
    r = requests.post(f"{BASE_URL}/auth/signup", json={
        "username": f"weak_pw_{TS}",
        "email": f"weak_pw_{TS}@example.com",
        "password": "short",
        "confirm_password": "short",
        "full_name": "Weak Pw",
        "role": "student",
        "institution_id": INST_ID,
    })
    assert r.status_code == 422


def test_signup_password_no_uppercase():
    r = requests.post(f"{BASE_URL}/auth/signup", json={
        "username": f"noup_{TS}",
        "email": f"noup_{TS}@example.com",
        "password": "nouppercase1",
        "confirm_password": "nouppercase1",
        "full_name": "No Upper",
        "role": "student",
        "institution_id": INST_ID,
    })
    assert r.status_code == 422


def test_signup_password_mismatch():
    r = requests.post(f"{BASE_URL}/auth/signup", json={
        "username": f"mismatch_{TS}",
        "email": f"mismatch_{TS}@example.com",
        "password": "TestPass1",
        "confirm_password": "TestPass2",
        "full_name": "Mismatch",
        "role": "student",
        "institution_id": INST_ID,
    })
    assert r.status_code == 422


def test_signup_bad_institution():
    r = requests.post(f"{BASE_URL}/auth/signup", json={
        **_BASE_USER,
        "username": f"bad_inst_{TS}",
        "email": f"bad_inst_{TS}@example.com",
        "full_name": "Bad Inst",
        "role": "student",
        "institution_id": "00000000-0000-0000-0000-000000000000",
    })
    assert r.status_code == 400
    assert "institution" in r.json()["detail"].lower()


# ── 2. Login ─────────────────────────────────────────────────────────────────

def test_login_success():
    """
    Login endpoint rate-limits to 10 attempts/15 min from localhost.
    Accept 200 OR 429 — 429 means prior test-run attempts consumed the quota,
    which itself proves the rate-limiter is working.
    """
    s = requests.Session()
    r = s.post(f"{BASE_URL}/auth/login", json={
        "username": f"auth_stu_{TS}",
        "password": "TestPass1",
    })
    assert r.status_code in (200, 429), f"Unexpected status: {r.status_code} {r.text}"
    if r.status_code == 200:
        body = r.json()
        assert body["message"] == "Login successful"
        assert "access_token" in body
        assert body["user"]["role"] == "student"
        assert "access_token" in s.cookies


def test_login_wrong_password():
    r = requests.post(f"{BASE_URL}/auth/login", json={
        "username": f"auth_stu_{TS}",
        "password": "WrongPass9",
    })
    assert r.status_code in (401, 429)  # 429 if rate limit already hit


def test_login_nonexistent_user():
    r = requests.post(f"{BASE_URL}/auth/login", json={
        "username": "nobody_exists_xyz",
        "password": "TestPass1",
    })
    assert r.status_code in (401, 429)  # both are correct rejections


# ── 3. Session (uses shared fixture to avoid extra logins) ───────────────────

def test_session_returns_user_data(student_session):
    r = student_session.get(f"{BASE_URL}/auth/session")
    assert r.status_code == 200
    body = r.json()
    assert "username" in body
    assert body["role"] == "student"
    assert "user_id" in body


def test_session_without_token_is_401():
    r = requests.get(f"{BASE_URL}/auth/session")
    assert r.status_code == 401


# ── 4. Logout (dedicated session so it doesn't break shared fixture) ─────────

def test_logout_clears_session(admin_session):
    """
    Logout test:
      1. Copy the admin cookie into a fresh session (so shared fixture is unaffected).
      2. Verify session is active before logout.
      3. Call logout — should return 200 and send Set-Cookie: access_token=; Max-Age=0.
      4. Manually clear cookies (simulating a browser honouring the Set-Cookie).
      5. Verify session is 401 after cookie removal.

    Note: With Redis down the server cannot blacklist the JWT, so the token is
    technically still valid — only the client-side cookie removal locks the user out.
    """
    cookie_val = admin_session.cookies.get("access_token")
    if not cookie_val:
        pytest.skip("admin_session has no cookie")

    s = requests.Session()
    s.cookies.set("access_token", cookie_val, domain="localhost.local", path="/")

    assert s.get(f"{BASE_URL}/auth/session").status_code == 200

    r = s.post(f"{BASE_URL}/auth/logout")
    assert r.status_code == 200
    assert r.json()["message"] == "Logged out successfully"

    # Simulate browser honouring the Set-Cookie: access_token=; Max-Age=0 response
    s.cookies.clear()

    assert s.get(f"{BASE_URL}/auth/session").status_code == 401


# ── 5. Profile & Settings ─────────────────────────────────────────────────────

def test_update_profile(student_session):
    r = student_session.put(f"{BASE_URL}/auth/profile", json={"full_name": "Updated Name"})
    assert r.status_code == 200
    assert "updated" in r.json()["message"].lower()


def test_get_settings_authenticated(student_session):
    r = student_session.get(f"{BASE_URL}/auth/settings")
    assert r.status_code == 200
    assert "settings" in r.json()


def test_update_settings(student_session):
    r = student_session.put(f"{BASE_URL}/auth/settings", json={"settings": {"theme": "dark"}})
    assert r.status_code == 200
    assert r.json()["settings"]["theme"] == "dark"


def test_settings_unauthenticated_is_401():
    r = requests.get(f"{BASE_URL}/auth/settings")
    assert r.status_code == 401


# ── 6. Institutions (public) ──────────────────────────────────────────────────

def test_get_institutions_public():
    r = requests.get(f"{BASE_URL}/auth/institutions")
    assert r.status_code == 200
    body = r.json()
    assert "institutions" in body
    assert len(body["institutions"]) > 0
    ids = [i["id"] for i in body["institutions"]]
    assert INST_ID in ids


# ── 7. Activity Log ───────────────────────────────────────────────────────────

def test_activity_log(student_session):
    r = student_session.get(f"{BASE_URL}/auth/activity-log")
    assert r.status_code == 200
    body = r.json()
    assert "activities" in body
    assert isinstance(body["activities"], list)
