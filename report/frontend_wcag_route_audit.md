# Frontend WCAG Route-by-Route Audit

Date: 2026-03-16
Method: Static heuristic audit of each route component for light-theme utility usage (`bg/text/border` gray/slate classes) versus explicit `dark:` coverage, plus targeted manual review of high-traffic routes.

## Legend
- PASS: Dark-safe coverage present and visual checks acceptable.
- MEDIUM: Partial dark coverage; likely readable but inconsistent.
- HIGH: Significant light-only classes and no/low dark coverage.

## Route Results
| Role | Route | Component | Light Utility Count | dark: Count | Status | Notes |
|---|---|---|---:|---:|---|---|
| Student | Home | src/components/student/StudentHome.tsx | 73 | 57 | MEDIUM | Mostly covered, but still mixed styling approaches. |
| Student | AI Assistant | src/components/student/ChatInterface.tsx | 1 | 6 | PASS | Migrated to shared primitives and semantic dark-safe surfaces. |
| Student | My Submissions | src/components/student/StudentAssignmentManager.tsx | 4 | 18 | PASS | Migrated to shared primitives and dark-safe semantic cards/forms. |
| Student | Quizzes | src/components/student/StudentQuizzes.tsx | 11 | 11 | MEDIUM | Major primitive migration complete; remaining gray utility remnants are minor. |
| Student | Flashcards | src/components/student/StudentFlashcards.tsx | 0 | 3 | PASS | Migrated to shared primitives and dark-safe visual tokens. |
| Student | Enrolled Sections | src/components/student/EnrolledSections.tsx | 37 | 27 | MEDIUM | Partial dark support; needs primitive migration. |
| Student | Course Overview | src/components/student/EnhancedCourseOverview.tsx | 142 | 139 | PASS | Strong dark coverage already present. |
| Instructor | Home | src/components/instructor/InstructorHome.tsx | 32 | 49 | PASS | Dark coverage exceeds light utility usage. |
| Instructor | Attendance | src/components/instructor/AttendanceManager.tsx | 34 | 36 | PASS | Fixed for clarity; now dark-safe with primitives. |
| Instructor | Quiz Creator | src/components/instructor/QuizCreator.tsx | 58 | 40 | MEDIUM | Improved with primitives; remaining custom color blocks can be unified further. |
| Instructor | Quiz Review | src/components/instructor/QuizReviewManager.tsx | 0 | 7 | PASS | Migrated to shared primitives with dark-safe feedback/controls. |
| Instructor | Flashcards | src/components/instructor/FlashcardManager.tsx | 20 | 0 | HIGH | Light-only classes. |
| Instructor | Lesson Plans | src/components/instructor/LessonPlanner.tsx | 9 | 0 | HIGH | Light-only classes. |
| Instructor | Assignments | src/components/instructor/AssignmentManager.tsx | 39 | 0 | HIGH | Light-only classes. |
| Instructor | Analytics | src/components/instructor/AnalyticsDashboard.tsx | 23 | 27 | PASS | Acceptable dark support. |
| Instructor | My Classes | src/components/instructor/EnhancedSectionManager.tsx | 61 | 42 | MEDIUM | Good progress, still mixed patterns. |
| Instructor | Reports | src/components/instructor/AttendanceReportView.tsx | 85 | 95 | PASS | Strong dark coverage. |
| Admin | Dashboard | src/components/admin/AdminDashboard.tsx | 18 | 0 | HIGH | Needs dark variants/primitive adoption. |
| Admin | Teachers | src/components/admin/AdminTeacherManager.tsx | 49 | 0 | HIGH | Needs dark variants/primitive adoption. |
| Admin | Classes | src/components/admin/AdminClassManager.tsx | 0 | 0 | PASS | Shifted to semantic token styling; light-only gray classes removed. |
| Admin | Courses | src/components/admin/AdminCourseManager.tsx | 2 | 0 | MEDIUM | Semantic-token migration done; a small number of gray utilities remain. |
| Admin | Enrollments | src/components/admin/AdminEnrollmentCenter.tsx | 57 | 0 | HIGH | Needs dark variants/primitive adoption. |
| Shared | Header | src/components/shared/Header.tsx | 55 | 35 | MEDIUM | Partially dark-safe; should use shared Input/Button primitives end-to-end. |
| Shared | Sidebar | src/components/shared/Sidebar.tsx | 4 | 4 | PASS | Consistent. |
| Shared | MobileNav | src/components/shared/MobileNav.tsx | 7 | 7 | PASS | Consistent. |

## WCAG Priority Issues
1. Contrast risk in routes with `dark: 0` and high light utility count (HIGH status routes).
2. Inconsistent component system usage causes state-color drift between pages.
3. Non-unified form controls (input/select/textarea/button) reduce predictable interaction affordances.

## Security Findings (Frontend)
1. Token storage in `localStorage` was removed; auth now relies on secure cookies/session.
2. `dangerouslySetInnerHTML` is now sanitized with DOMPurify in student assignment instructions.

## Refactor Progress
Completed:
- Added shared primitives: `Button`, `Card`, `Input`, `Select`.
- Migrated `AttendanceManager`, `QuizCreator`, `QuizReviewManager`, `ChatInterface`, `StudentFlashcards`, `StudentAssignmentManager`, and `StudentQuizzes` to primitives.
- Migrated `AdminClassManager` and `AdminCourseManager` to semantic token styling for dark-safe consistency.
- Improved global dark compatibility for `slate` text/background/border classes.

Remaining for strict full consistency:
- Migrate all HIGH status routes to primitives and explicit dark variants.
- Run runtime contrast checks for text/background pairs at 4.5:1 (normal text) and 3:1 (large text/icons).
- Normalize semantic tokens (primary/success/warning/danger) across all role dashboards.
