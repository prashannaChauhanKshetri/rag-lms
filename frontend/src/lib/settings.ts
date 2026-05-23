import { api } from './api';

export type GradeDisplay = 'percentage' | 'letter' | 'points';
export type DefaultSignupRole = 'student' | 'instructor';

export interface UserSettings {
    notifications?: Record<string, boolean>;
    teaching_preferences?: {
        grade_display: GradeDisplay;
        default_due_time: string;
        auto_publish_quiz_results: boolean;
    };
    admin_user_defaults?: {
        default_role: DefaultSignupRole;
        max_enrollment: number;
        auto_approve_enrollments: boolean;
    };
    platform_config?: {
        platform_name: string;
        max_institutions: number;
        maintenance_mode: boolean;
        registration_open: boolean;
    };
    appearance?: {
        theme: 'light' | 'dark';
        fontSize?: 'small' | 'medium' | 'large';
        reduceMotion?: boolean;
        highContrast?: boolean;
    };
}

interface SettingsResponse {
    settings: UserSettings;
}

export interface ActivityItem {
    timestamp: string;
    event_type: string;
    description: string;
}

interface ActivityResponse {
    activities: ActivityItem[];
}

export interface ExportSummary {
    includes: string[];
    counts: {
        profile_fields: number;
        settings_keys: number;
        quiz_attempts: number;
        assignment_submissions: number;
        attendance_records: number;
        attendance_rate_percent: number | null;
    };
    attendance_breakdown: {
        present: number;
        absent: number;
        late: number;
        excused: number;
    };
}

export interface QuizRecord {
    id: string;
    quiz_id: string;
    score: number | null;
    submitted_at: string;
}

export interface AssignmentRecord {
    id: string;
    assignment_id: string;
    score: number | null;
    feedback: string | null;
    submitted_at: string;
}

export interface AttendanceRecord {
    id: string;
    section_id: string;
    date: string;
    status: 'present' | 'absent' | 'late' | 'excused';
    notes: string | null;
    created_at: string;
}

export interface ExportData {
    generated_at: string;
    profile: {
        id: string;
        username: string;
        email: string;
        full_name: string;
        role: string;
        institution_id: string;
        created_at: string;
        updated_at: string;
    };
    academics: {
        summary: {
            quiz_attempts: number;
            graded_quizzes: number;
            quiz_average_score: number | null;
            assignment_submissions: number;
            graded_assignments: number;
            assignment_average_score: number | null;
            attendance_records: number;
            attendance_rate_percent: number | null;
        };
        quiz_results: { records: QuizRecord[] };
        assignment_results: { records: AssignmentRecord[] };
        attendance: {
            by_status: { present: number; absent: number; late: number; excused: number };
            records: AttendanceRecord[];
        };
    };
}

export async function getUserSettings(): Promise<UserSettings> {
    const response = await api.get('/auth/settings') as SettingsResponse;
    return response.settings || {};
}

export async function updateUserSettings(settingsPatch: UserSettings): Promise<UserSettings> {
    const response = await api.put('/auth/settings', { settings: settingsPatch }) as SettingsResponse;
    return response.settings || {};
}

export async function getActivityLog(limit: number = 20): Promise<ActivityItem[]> {
    const response = await api.get(`/auth/activity-log?limit=${limit}`) as ActivityResponse;
    return response.activities || [];
}

export async function getExportSummary(): Promise<ExportSummary> {
    return await api.get('/auth/export-summary') as ExportSummary;
}

/** Fetch export data for preview (no download triggered). */
export async function getExportData(): Promise<ExportData> {
    return await api.get('/auth/export-data') as ExportData;
}

/** Download all student data as a multi-section CSV spreadsheet. */
export async function exportMyDataAsCSV(): Promise<void> {
    const data = await getExportData();
    const rows: string[] = [];

    // --- Profile ---
    rows.push('SECTION: Profile');
    rows.push('Field,Value');
    const p = data.profile;
    rows.push(`Username,${p.username}`);
    rows.push(`Full Name,${p.full_name}`);
    rows.push(`Email,${p.email}`);
    rows.push(`Role,${p.role}`);
    rows.push(`Member Since,${new Date(p.created_at).toLocaleDateString()}`);
    rows.push('');

    // --- Quiz Results ---
    rows.push('SECTION: Quiz Results');
    rows.push('#,Quiz ID,Score,Submitted At');
    data.academics.quiz_results.records.forEach((r, i) => {
        const score = r.score != null ? r.score : 'N/A';
        rows.push(`${i + 1},${r.quiz_id},${score},${new Date(r.submitted_at).toLocaleString()}`);
    });
    rows.push('');

    // --- Assignment Results ---
    rows.push('SECTION: Assignment Results');
    rows.push('#,Assignment ID,Score,Feedback,Submitted At');
    data.academics.assignment_results.records.forEach((r, i) => {
        const score = r.score != null ? r.score : 'N/A';
        const fb = (r.feedback ?? '').replace(/,/g, ';');
        rows.push(`${i + 1},${r.assignment_id},${score},${fb},${new Date(r.submitted_at).toLocaleString()}`);
    });
    rows.push('');

    // --- Attendance ---
    rows.push('SECTION: Attendance');
    rows.push('#,Section ID,Date,Status,Notes');
    data.academics.attendance.records.forEach((r, i) => {
        const notes = (r.notes ?? '').replace(/,/g, ';');
        rows.push(`${i + 1},${r.section_id},${r.date},${r.status},${notes}`);
    });

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `my-data-export-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}
