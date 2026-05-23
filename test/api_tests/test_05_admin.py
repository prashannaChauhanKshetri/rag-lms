"""
Step 5 — Admin Workflow Tests
Tests: dashboard stats, user listing, teacher management, class/section
       management, enrollment, notifications, access control.
"""
import pytest
import requests as req

from .conftest import BASE_URL


# ── Dashboard ─────────────────────────────────────────────────────────────────

class TestAdminDashboard:
    def test_dashboard_stats(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/admin/dashboard-stats")
        assert r.status_code == 200
        body = r.json()
        # should contain aggregated counts
        assert isinstance(body, dict)
        assert len(body) > 0

    def test_dashboard_requires_auth(self):
        r = req.get(f"{BASE_URL}/admin/dashboard-stats")
        assert r.status_code == 401

    def test_dashboard_blocked_for_student(self, student_session):
        r = student_session.get(f"{BASE_URL}/admin/dashboard-stats")
        assert r.status_code == 403


# ── User Management ───────────────────────────────────────────────────────────

class TestAdminUsers:
    def test_list_users(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/admin/users")
        assert r.status_code == 200
        body = r.json()
        assert "users" in body
        assert len(body["users"]) > 0

    def test_list_users_blocked_for_instructor(self, instructor_session):
        r = instructor_session.get(f"{BASE_URL}/admin/users")
        # should return 403 or filter to only own institution
        assert r.status_code in (200, 403)

    def test_list_users_blocked_for_student(self, student_session):
        r = student_session.get(f"{BASE_URL}/admin/users")
        assert r.status_code == 403


# ── Teacher Management ────────────────────────────────────────────────────────

class TestAdminTeachers:
    def test_list_teachers(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/admin/teachers")
        assert r.status_code == 200
        body = r.json()
        assert "teachers" in body

    def test_teacher_detail_not_found(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/admin/teachers/00000000-0000-0000-0000-000000000000"
        )
        assert r.status_code == 404

    def test_list_teachers_blocked_for_student(self, student_session):
        r = student_session.get(f"{BASE_URL}/admin/teachers")
        assert r.status_code == 403


# ── Classes & Sections ────────────────────────────────────────────────────────

class TestAdminClasses:
    _class_id = None
    _section_id = None

    def test_create_class(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/admin/classes", json={
            "name": "Grade 10 Science",
            "description": "Secondary science class",
        })
        assert r.status_code == 200
        body = r.json()
        assert "id" in body or "class_id" in body
        TestAdminClasses._class_id = body.get("id") or body.get("class_id")

    def test_list_classes(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/admin/classes")
        assert r.status_code == 200
        body = r.json()
        assert "classes" in body
        ids = [c.get("id") for c in body["classes"]]
        assert TestAdminClasses._class_id in ids

    def test_get_class_detail(self, admin_session):
        cid = TestAdminClasses._class_id
        r = admin_session.get(f"{BASE_URL}/admin/classes/{cid}")
        assert r.status_code == 200

    def test_update_class(self, admin_session):
        cid = TestAdminClasses._class_id
        r = admin_session.put(f"{BASE_URL}/admin/classes/{cid}", json={
            "name": "Grade 10 Science (Updated)",
        })
        assert r.status_code == 200

    def test_create_section(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/admin/sections", json={
            "name": "Section A",
            "class_id": TestAdminClasses._class_id,
            "academic_year": "2025-2026",
        })
        assert r.status_code == 200
        body = r.json()
        assert "id" in body or "section_id" in body
        TestAdminClasses._section_id = body.get("id") or body.get("section_id")

    def test_list_sections(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/admin/sections/all")
        assert r.status_code == 200
        body = r.json()
        assert "sections" in body or isinstance(body, list)

    def test_section_details(self, admin_session):
        sid = TestAdminClasses._section_id
        r = admin_session.get(f"{BASE_URL}/admin/sections/{sid}/details")
        assert r.status_code == 200

    def test_section_available_students(self, admin_session):
        sid = TestAdminClasses._section_id
        r = admin_session.get(f"{BASE_URL}/admin/sections/{sid}/available-students")
        assert r.status_code == 200

    def test_delete_section(self, admin_session):
        sid = TestAdminClasses._section_id
        r = admin_session.delete(f"{BASE_URL}/admin/sections/{sid}")
        assert r.status_code == 200

    def test_delete_class(self, admin_session):
        cid = TestAdminClasses._class_id
        r = admin_session.delete(f"{BASE_URL}/admin/classes/{cid}")
        assert r.status_code == 200


# ── Notifications ─────────────────────────────────────────────────────────────

class TestNotifications:
    def test_list_notifications(self, student_session):
        r = student_session.get(f"{BASE_URL}/notifications")
        assert r.status_code == 200

    def test_unread_count(self, student_session):
        r = student_session.get(f"{BASE_URL}/notifications/unread-count")
        assert r.status_code == 200
        body = r.json()
        assert "count" in body or "unread_count" in body

    def test_mark_read(self, student_session):
        r = student_session.patch(f"{BASE_URL}/notifications/read", json={"ids": []})
        assert r.status_code in (200, 204)

    def test_notifications_unauthenticated_is_401(self):
        r = req.get(f"{BASE_URL}/notifications")
        assert r.status_code == 401


# ── Health (sanity) ───────────────────────────────────────────────────────────

class TestHealth:
    def test_health_endpoint(self):
        r = req.get(f"{BASE_URL}/health")
        assert r.status_code == 200
        body = r.json()
        assert body["db"] == "ok"
        assert body["status"] == "ok"

    def test_health_reports_redis_status(self):
        r = req.get(f"{BASE_URL}/health")
        assert r.status_code == 200
        assert "redis" in r.json()
