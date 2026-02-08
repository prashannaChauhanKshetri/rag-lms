# System Architecture: Enrollment Management

## 🏗️ Complete Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RAG-LMS ENROLLMENT SYSTEM                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐           ┌──────────────────────┐           │
│  │   STUDENT CLIENT     │           │  INSTRUCTOR CLIENT   │           │
│  │  (React + TypeScript)│           │  (React + TypeScript)│           │
│  ├──────────────────────┤           ├──────────────────────┤           │
│  │ • EnrolledSections   │           │ • SectionManager     │           │
│  │   - List sections    │           │   - Manage sections  │           │
│  │   - Show stats       │           │   - List students    │           │
│  │                      │           │   - Remove students  │           │
│  │ • ComposeOverview    │           │                      │           │
│  │   - Details tab      │           │ • EnrollmentManager  │           │
│  │   - Assignments tab  │           │   - Bulk enroll      │           │
│  │   - Resources tab    │           │   - CSV upload       │           │
│  │   - Attendance tab   │           │                      │           │
│  └──────────────────────┘           │ • AttendanceReports  │           │
│          │                          │   - Date filtering   │           │
│          │                          │   - CSV export       │           │
│          │                          └──────────────────────┘           │
│          │                                  │                          │
│          └──────────────┬───────────────────┘                          │
│                         │                                              │
│                    HTTP/REST API                                       │
│                    (Port 8000)                                         │
│                         │                                              │
│          ┌──────────────▼───────────────────┐                         │
│          │      FastAPI BACKEND              │                         │
│          │    (routes/instructor.py)         │                         │
│          │    (routes/student.py)            │                         │
│          ├──────────────────────────────────┤                         │
│          │ Endpoints:                        │                         │
│          │ GET    /student/sections          │                         │
│          │ GET    /student/sections/{id}     │                         │
│          │ GET    /instructor/sections/{id}  │                         │
│          │ GET    /instructor/sections/...   │                         │
│          │ POST   /instructor/.../bulk-enrol │ ← Process bulk enroll  │
│          │ POST   /instructor/.../attendance │ ← Generate reports     │
│          │ DELETE /instructor/.../students   │ ← Remove students      │
│          └──────────────┬────────────────────┘                         │
│                         │                                              │
│          ┌──────────────▼───────────────────┐                         │
│          │   DATABASE LAYER                  │                         │
│          │  (database_postgres.py)           │                         │
│          ├──────────────────────────────────┤                         │
│          │ Functions:                        │                         │
│          │ • enroll_student()                │                         │
│          │ • bulk_enroll_students()          │                         │
│          │ • list_enrollments()              │                         │
│          │ • remove_enrollment()             │                         │
│          │ • get_attendance_report()         │                         │
│          │ • can_teacher_manage_section()    │                         │
│          │ • can_student_access_section()    │                         │
│          │ (+ authorization wrappers)        │                         │
│          └──────────────┬────────────────────┘                         │
│                         │                                              │
│          ┌──────────────▼───────────────────┐                         │
│          │   POSTGRESQL DATABASE             │                         │
│          │    (Port 5432)                    │                         │
│          ├──────────────────────────────────┤                         │
│          │ Tables:                           │                         │
│          │ • users (all roles)               │                         │
│          │ • teacher_profiles & student_prof │                         │
│          │ • institutions (multi-tenant)     │                         │
│          │ • sections & classes              │                         │
│          │ • enrollments & audit             │                         │
│          │ • attendance                      │                         │
│          │ • assignments & submissions       │                         │
│          │ • lesson_plans (AI generated)     │                         │
│          │ • flashcards & quizzes            │                         │
│          │ • resources                       │                         │
│          │                                   │                         │
│          │ Extensions:                       │                         │
│          │ • pgvector (384-dim vectors)      │                         │
│          └──────────────────────────────────┘                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Flow Diagrams

### Student Enrollment View Flow

```
┌─────────────────────────────────┐
│  Student Login (JWT Token)      │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ GET /student/sections           │ ← Fetch all enrolled sections
├─────────────────────────────────┤
│ Response:                       │
│ [                               │
│   {                             │
│     id: "sec-001",              │
│     name: "Intro to Python",    │
│     teacher: "Mr. Smith",       │
│     attendance_percentage: 75.5,│
│     pending_assignments: 2,     │
│     student_count: 45           │
│   },                            │
│   { ... }                       │
│ ]                               │
└──────────────┬──────────────────┘
               │
               ▼
        ┌──────────────┐
        │ EnrolledSec  │  ← Display cards with stats
        │   tions      │
        └──────────────┘
               │ (on click section)
               ▼
  ┌────────────────────────────────┐
  │ GET /student/sections/{sectionId} │
  ├────────────────────────────────┤
  │ Response: {                    │
  │   section: {...},              │
  │   teacher: {...},              │
  │   assignments: [...],          │
  │   resources: [...],            │
  │   attendance: {                │
  │     total: 30,                 │
  │     present: 25,               │
  │     percentage: 83.3,          │
  │     records: [...]             │
  │   }                            │
  │ }                              │
  └────────────────────────────────┘
               │
               ▼
    ┌──────────────────────────┐
    │ EnhancedCourseOverview    │ ← Show details (4 tabs)
    │ • Overview              │
    │ • Assignments           │
    │ • Resources             │
    │ • Attendance            │
    └──────────────────────────┘
```

### Instructor Enrollment Management Flow

```
┌─────────────────────────────────┐
│ Instructor Login (JWT Token)    │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ GET /instructor/sections/{cbid} │ ← List sections
├─────────────────────────────────┤
│ Response: [{id, name, ...}, ... │
└──────────────┬──────────────────┘
               │
               ▼
  ┌────────────────────────────┐
  │ EnhancedSectionManager      │ ← (select section)
  │ • List in sidebar          │
  └────────────────────────────┘
               │ (select section)
      ┌────────┴────────┐
      │                 │
      ▼                 ▼
 ┌─────────┐       ┌──────────────┐
 │Enroll   │       │Attendance    │
 │Manager  │       │Report        │
 └────┬────┘       └──────┬───────┘
      │                   │
      ▼                   ▼
┌──────────────────┐  ┌──────────────────────┐
│POST bulk-enroll  │  │POST attendance-report│
├──────────────────┤  ├──────────────────────┤
│Request:          │  │Request:              │
│{                 │  │{                     │
│  student_ids:    │  │  start_date: "..."   │
│  ["s001", ...]   │  │  end_date: "..."     │
│}                 │  │}                     │
│                  │  │                      │
│Response:         │  │Response:             │
│{                 │  │{                     │
│  enrolled: [...],│  │  total_classes: 30,  │
│  skipped: [...]  │  │  student_records: [.│
│}                 │  │}                     │
└──────────────────┘  └──────────────────────┘
      │                       │
      ▼                       ▼
 Success Alert       Report with export
```

---

## 🔑 Key Flows

### Bulk Enrollment Flow

```
┌─────────────────────────────────────┐
│ Instructor clicks "Bulk Enroll"     │
└─────────────┬───────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ EnrollmentManager   │
    │ Shows input form    │
    └─────────┬───────────┘
              │
      ┌───────┴───────┐
      │               │
      ▼               ▼
  ┌────────┐    ┌────────┐
  │Paste   │    │CSV File│
  │IDs     │    │Upload  │
  └───┬────┘    └────┬───┘
      │             │
      └─────┬───────┘
            │ Parse IDs
            ▼
  ┌──────────────────┐
  │ Validate IDs     │
  │ • Check format   │
  │ • Check exists   │
  └────────┬─────────┘
           │
           ▼
  ┌────────────────────────────────┐
  │ Confirm enrollment             │
  │ Preview (first 5 + more count) │
  └────────┬───────────────────────┘
           │
           ▼ (on confirm)
  ┌────────────────────────────┐
  │ POST bulk-enroll           │
  │ /instructor/sections/{id}  │
  │ /bulk-enroll               │
  │                            │
  │ API processes:            │
  │ • Validate each ID        │
  │ • Skip duplicates         │
  │ • Skip non-existent       │
  │ • Enroll valid ones       │
  │ • Log audit trail         │
  │                            │
  │ Returns:                  │
  │ {                          │
  │   enrolled: [ok_ids],      │
  │   skipped: [{id, reason}]  │
  │ }                          │
  └────────┬──────────────────┘
           │
           ▼
  ┌──────────────────┐
  │ Show results     │
  │ "Enrolled 45,    │
  │  Skipped 3"      │
  └──────────────────┘
```

### Attendance Report Generation

```
┌──────────────────────────────┐
│ Select Date Range            │
│ Start: [2024-01-01]          │
│ End:   [2024-01-31]          │
└──────────┬───────────────────┘
           │
           ▼ (on confirm)
┌──────────────────────────────────┐
│ POST attendance-report endpoint   │
│ /instructor/sections/{id}/...     │
│                                   │
│ Database query:                  │
│ • Find all attendance records    │
│   WHERE section_id = X           │
│   AND date BETWEEN start AND end │
│ • GROUP BY student_id            │
│ • COUNT CASE status = 'present'  │
│ • COUNT CASE status = 'absent'   │
│ • COUNT CASE status = 'late'     │
│ • COUNT CASE status = 'excused'  │
│ • Calculate percentage           │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Build response:                  │
│ {                                │
│   total_classes: 30,             │
│   student_records: [             │
│     {                            │
│       student_id: "s001",        │
│       full_name: "Alice",        │
│       present_count: 25,         │
│       absent_count: 3,           │
│       late_count: 1,             │
│       excused_count: 1,          │
│       attendance_percentage: 83.3│
│     },                           │
│     ...                          │
│   ]                             │
│ }                                │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ AttendanceReportView         │
│ • Display summary stats      │
│ • Show table with sorting    │
│ • Color-code percentages     │
│ • Enable CSV export          │
└──────────────────────────────┘
```

---

## 🔐 Authorization Flow

```
┌────────────────────────────────┐
│ User makes API request         │
│ GET /student/sections/sec-001  │
└────────────┬───────────────────┘
             │ Include JWT token
             ▼
┌────────────────────────────────┐
│ FastAPI Route Handler          │
│ Dependency: get_current_user   │
├────────────────────────────────┤
│ • Verify JWT signature         │
│ • Extract user_id, role        │
│ • Return user object           │
└────────────┬───────────────────┘
             │ user = {
             │   id: "s001",
             │   role: "student"
             │ }
             ▼
┌────────────────────────────────┐
│ Route Authorization Check      │
│ (utils_auth.py)                │
├────────────────────────────────┤
│ if role == 'student':          │
│   • Call can_student_access    │
│     _section(student_id, sec)  │
│   • Query database function:   │
│     SELECT EXISTS(             │
│       SELECT 1 FROM            │
│       enrollments              │
│       WHERE student_id = $1    │
│       AND section_id = $2      │
│       AND deleted_at IS NULL   │
│     )                          │
└────────────┬───────────────────┘
             │
      ┌──────┴──────┐
      │             │
      ▼ (allowed)   ▼ (denied)
  ┌────────┐    ┌──────────┐
  │Continue│    │Return 403│
  │Request │    │Forbidden │
  └────┬───┘    └──────────┘
       │
       ▼
  ┌──────────────────────┐
  │ Fetch data from DB   │
  │ Return response      │
  └──────────────────────┘
```

---

## 🗄️ Database Schema Relationships

```
institutions
    │
    ├─► users (role: student/instructor/admin)
    │       │
    │       ├─► teacher_profiles (one-to-one)
    │       └─► student_profiles (one-to-one)
    │
    ├─► chatbots (courses)
    │       │
    │       ├─► documents (RAG source)
    │       │       └─► document_chunks (pgvector)
    │       │
    │       ├─► lesson_plans
    │       ├─► flashcards
    │       └─► quizzes
    │
    ├─► sections
    │       │
    │       ├─► enrollments
    │       │       └─► enrollment_audit
    │       │
    │       ├─► attendance
    │       │
    │       ├─► assignments
    │       │       └─► assignment_submissions
    │       │
    │       └─► resources
    │
    └─► classes
```

### Key Tables for Enrollment

```
┌──────────────┐         ┌──────────────┐
│ sections     │────────▶│ users        │
│              │         │ (teacher_id) │
│ id           │         │              │
│ name         │         │ id           │
│ teacher_id   │         │ username     │
│ institution  │         │ email        │
│ chatbot_id   │         │              │
└──────────────┘         └──────────────┘
       ▲
       │
       │
┌──────────────┐         ┌──────────────┐
│ enrollments  │────────▶│ users        │
│ (soft-delete)          │ (student_id) │
│              │         │              │
│ id           │         │ id           │
│ section_id   │         │ username     │
│ student_id   │         │ email        │
│ enrolled_at  │         │              │
│ deleted_at   │         └──────────────┘
│              │
└──────────────┘
       ▲
       │
       │
┌──────────────────────┐
│ enrollment_audit     │
│ (audit trail)        │
│                      │
│ id                   │
│ enrollment_id        │
│ action               │
│ performed_by         │
│ reason               │
│ created_at           │
└──────────────────────┘
```

---

## 🚀 Component Communication

```
Frontend (React)
    │
    ├─── EnrolledSections
    │         │
    │         └─► GET /student/sections ─┐
    │                                    │
    ├─── EnhancedCourseOverview          │
    │         │                          │
    │         └─► GET /student/sections/{id} ─┐
    │                                         │
    ├─── EnhancedSectionManager              │
    │         │                              │
    │         ├─► GET /instructor/sections/* ─┘──┐
    │         │                                 │
    │         └─► GET .../students/*            │
    │                                           │
    ├─── EnrollmentManager                      │
    │         │                                 │
    │         └─► POST .../bulk-enroll         │
    │                                           │
    └─── AttendanceReportView                   │
            │                                   │
            └─► POST .../attendance-report ──┐
                                             │
Backend (FastAPI)  ◄──────────────────────────┘
    │
    ├─► /student/sections (Dashboard)
    ├─► /student/progress (Analytics)
    ├─► /student/assignments/pending
    ├─► /instructor/lesson-plans/generate (AI)
    ├─► /instructor/flashcards/generate (AI)
    ├─► /instructor/analytics/course/{id}
    ├─► /instructor/sections/{id}/bulk-enroll
    └─► /instructor/sections/{id}/attendance-report
            │
            ▼
Database Layer (database_postgres.py)
    │
    ├─► enroll_student()
    ├─► bulk_enroll_students()
    ├─► list_enrollments()
    ├─► remove_enrollment()
    ├─► get_attendance_report()
    ├─► get_enrollment_history()
    └─► Authorization functions
            │
            ▼
PostgreSQL Database
```

---

## 📈 Request/Response Examples

### Bulk Enroll Request/Response

```json
REQUEST:
POST /instructor/sections/sec-001/bulk-enroll
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "student_ids": ["student-002", "student-003", "student-004"]
}

RESPONSE (200 OK):
{
  "enrolled": ["student-002", "student-003", "student-004"],
  "skipped": [],
  "timestamp": "2024-01-20T10:30:00Z"
}

OR (with conflicts):

{
  "enrolled": ["student-002", "student-003"],
  "skipped": [
    {
      "student_id": "student-004",
      "reason": "Not found in system"
    },
    {
      "student_id": "student-002",
      "reason": "Already enrolled"
    }
  ],
  "timestamp": "2024-01-20T10:30:00Z"
}
```

### Attendance Report Request/Response

```json
REQUEST:
POST /instructor/sections/sec-001/attendance-report
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "start_date": "2024-01-01",
  "end_date": "2024-01-31"
}

RESPONSE (200 OK):
{
  "section_id": "sec-001",
  "start_date": "2024-01-01",
  "end_date": "2024-01-31",
  "total_classes": 30,
  "student_records": [
    {
      "student_id": "student-001",
      "full_name": "Alice Johnson",
      "email": "alice@uni.edu",
      "present_count": 25,
      "absent_count": 3,
      "late_count": 1,
      "excused_count": 1,
      "attendance_percentage": 83.3
    },
    {
      "student_id": "student-002",
      "full_name": "Bob Smith",
      "email": "bob@uni.edu",
      "present_count": 28,
      "absent_count": 1,
      "late_count": 0,
      "excused_count": 1,
      "attendance_percentage": 93.3
    }
  ]
}
```

---

## 🔄 Soft-Delete & Re-enrollment Flow

```
Enrollment Lifecycle:

1. Initial Enrollment
   INSERT INTO enrollments (id, section_id, student_id)
   VALUES ('enroll-001', 'sec-001', 'student-001');
   
   State: deleted_at = NULL (active)

2. Student Removed
   UPDATE enrollments
   SET deleted_at = CURRENT_TIMESTAMP
   WHERE id = 'enroll-001';
   
   State: deleted_at = 2024-01-20 10:30:00 (soft-deleted)
   
   Audit Entry:
   INSERT INTO enrollment_audit ...
   VALUES (..., 'unenrolled', 'Removed by instructor', ...);

3. Re-enroll Same Student (allowed!)
   UPDATE enrollments
   SET deleted_at = NULL,
       enrolled_at = CURRENT_TIMESTAMP
   WHERE id = 'enroll-001';
   
   State: deleted_at = NULL (active again)
   
   Audit Entry:
   INSERT INTO enrollment_audit ...
   VALUES (..., 'enrolled', 'Re-enrolled', ...);

Benefits:
✓ No data loss
✓ Audit trail preserved
✓ Can identify removal reason
✓ Allows re-enrollment
✓ Handles "mistaken removal" scenario
```

---

## 🎯 Error Handling Flows

```
┌─────────────────────┐
│ Student A tries to  │
│ access Section B    │
│ (not enrolled in)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────┐
│ API checks authorization:       │
│ can_student_access_section(     │
│   student_a, section_b          │
│ )                               │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ SQL Query:                      │
│ SELECT 1 FROM enrollments       │
│ WHERE student_id = 'a'          │
│ AND section_id = 'b'            │
│ AND deleted_at IS NULL          │
│                                 │
│ Result: No rows found           │
│ Returns: FALSE                  │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ FastAPI Route Handler:          │
│ if not authorized:              │
│   raise HTTPException(          │
│     status_code=403,            │
│     detail="Not enrolled"       │
│   )                             │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ HTTP Response:                  │
│ 403 Forbidden                   │
│ {"detail": "Not enrolled"}      │
└─────────────────────────────────┘
```

---

This architecture ensures:
✅ Multi-tenant isolation
✅ Role-based authorization
✅ Data integrity with soft-delete
✅ Full audit trails
✅ Scalable design
✅ RESTful API consistency
✅ Responsive

 UI
✅ Dark mode support
✅ Professional UX
