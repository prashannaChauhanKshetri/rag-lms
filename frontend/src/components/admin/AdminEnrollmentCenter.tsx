import React, { useState, useEffect, useCallback } from 'react';
import {
    Users,
    Search,
    Plus,
    Trash2,
    Upload,
    UserPlus,
    AlertCircle,
    CheckCircle,
    Loader2,
    ChevronDown,
    FileText,
    Clock,
    X,
} from 'lucide-react';
import { api } from '../../lib/api';

// --- Interfaces ---

interface Section {
    id: string;
    name: string;
    class_name?: string; // Added from backend join
    chatbot_id: string;
    teacher_id: string;
    teacher_name?: string;
    teacher_username?: string;
    student_count?: number;
}

interface EnrolledStudent {
    enrollment_id: string;
    student_id: string;
    username: string;
    full_name: string;
    email: string;
    enrolled_at: string;
    roll_number?: string;
    department?: string;
    attendance_percentage?: number;
}

interface AvailableStudent {
    id: string;
    username: string;
    full_name: string;
    email: string;
}

interface AuditEntry {
    id: string;
    action: string;
    performed_by: string;
    student_id: string;
    section_id: string;
    reason?: string;
    created_at: string;
}

interface BulkEnrollResult {
    enrolled: string[];
    skipped: { student_id: string; reason: string }[];
    timestamp: string;
}

type TabType = 'enrolled' | 'single-enroll' | 'bulk-enroll' | 'history';

// --- Component ---

const AdminEnrollmentCenter: React.FC = () => {
    // State
    const [sections, setSections] = useState<Section[]>([]);
    const [selectedSectionId, setSelectedSectionId] = useState<string>('');
    const [activeTab, setActiveTab] = useState<TabType>('enrolled');

    const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
    const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
    const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [csvFile, setCsvFile] = useState<File | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [bulkResult, setBulkResult] = useState<BulkEnrollResult | null>(null);

    // --- Data Loading ---

    const loadSections = useCallback(async () => {
        try {
            const response = await api.get('/admin/sections/all') as { sections: Section[] };
            setSections(response.sections || []);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to load sections');
        }
    }, []);

    const loadEnrolledStudents = useCallback(async () => {
        if (!selectedSectionId) return;
        setIsLoading(true);
        try {
            const response = await api.get(`/admin/sections/${selectedSectionId}/details`) as { students: EnrolledStudent[] };
            setEnrolledStudents(response.students || []);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to load enrolled students');
        } finally {
            setIsLoading(false);
        }
    }, [selectedSectionId]);

    const loadAvailableStudents = useCallback(async () => {
        if (!selectedSectionId) return;
        try {
            const search = searchTerm || undefined;
            const params = search ? `?search=${encodeURIComponent(search)}` : '';
            const response = await api.get(`/admin/sections/${selectedSectionId}/available-students${params}`) as AvailableStudent[];
            setAvailableStudents(response || []);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to load available students');
        }
    }, [selectedSectionId, searchTerm]);

    const loadHistory = useCallback(async () => {
        if (!selectedSectionId) return;
        try {
            const response = await api.get(`/admin/sections/${selectedSectionId}/enrollment-history`) as { enrollment_history: AuditEntry[] };
            setAuditHistory(response.enrollment_history || []);
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to load enrollment history');
        }
    }, [selectedSectionId]);

    // --- Effects ---

    useEffect(() => {
        loadSections();
    }, [loadSections]);

    useEffect(() => {
        if (selectedSectionId) {
            loadEnrolledStudents();
            if (activeTab === 'single-enroll') loadAvailableStudents();
            if (activeTab === 'history') loadHistory();
        }
    }, [selectedSectionId, activeTab, loadEnrolledStudents, loadAvailableStudents, loadHistory]);

    // --- Actions ---

    const handleSingleEnroll = async (studentId: string) => {
        if (!selectedSectionId) return;
        setIsEnrolling(true);
        setError('');
        setSuccess('');
        try {
            await api.post(`/admin/sections/${selectedSectionId}/enroll`, { student_id: studentId });
            setSuccess('Student enrolled successfully');
            loadEnrolledStudents();
            loadAvailableStudents();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to enroll student');
        } finally {
            setIsEnrolling(false);
        }
    };

    const handleBulkEnroll = async () => {
        if (!selectedSectionId) return;
        setIsEnrolling(true);
        setError('');
        setSuccess('');
        setBulkResult(null);

        let studentIds: string[] = [];

        if (csvFile) {
            // Parse CSV
            const text = await csvFile.text();
            studentIds = text
                .split(/[\n,]/)
                .map(id => id.trim())
                .filter(id => id.length > 0);
        } else if (bulkInput.trim()) {
            studentIds = bulkInput
                .split(/[\n,]/)
                .map(id => id.trim())
                .filter(id => id.length > 0);
        }

        if (studentIds.length === 0) {
            setError('Please enter student IDs or upload a CSV file');
            setIsEnrolling(false);
            return;
        }

        try {
            const result = await api.post(`/admin/sections/${selectedSectionId}/bulk-enroll`, { student_ids: studentIds }) as BulkEnrollResult;
            setBulkResult(result);
            setSuccess(`Successfully enrolled ${result.enrolled.length} students`);
            setBulkInput('');
            setCsvFile(null);
            loadEnrolledStudents();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Bulk enrollment failed');
        } finally {
            setIsEnrolling(false);
        }
    };

    const handleRemoveStudent = async (studentId: string, studentName: string) => {
        if (!confirm(`Remove ${studentName} from this section?`)) return;
        setError('');
        setSuccess('');
        try {
            await api.delete(`/admin/sections/${selectedSectionId}/students/${studentId}`);
            setSuccess(`${studentName} removed from section`);
            loadEnrolledStudents();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            setError(error.response?.data?.detail || 'Failed to remove student');
        }
    };

    // --- Render ---

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-[#10B981] to-[#059669] rounded-lg flex items-center justify-center flex-shrink-0">
                    <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Enrollment Management</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Manage student enrollments across all sections</p>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 flex-1">{error}</p>
                    <button onClick={() => setError('')}><X className="w-4 h-4 text-red-400" /></button>
                </div>
            )}
            {success && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-green-700 flex-1">{success}</p>
                    <button onClick={() => setSuccess('')}><X className="w-4 h-4 text-green-400" /></button>
                </div>
            )}

            {/* Section Selector */}
            <div className="bg-white rounded-xl shadow p-4 sm:p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Section</label>
                <div className="relative">
                    <select
                        value={selectedSectionId}
                        onChange={(e) => {
                            setSelectedSectionId(e.target.value);
                            setError('');
                            setSuccess('');
                            setBulkResult(null);
                        }}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981] appearance-none bg-white pr-10"
                    >
                        <option value="">— Choose a section —</option>
                        {sections.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.class_name ? `${s.class_name} — ` : ''}{s.name} ({s.student_count ?? '?'} students)
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
            </div>

            {/* Main Content (only shown when section selected) */}
            {selectedSectionId && (
                <>
                    {/* Tab Navigation */}
                    <div className="border-b border-gray-200">
                        <div className="flex gap-4 sm:gap-6 overflow-x-auto">
                            {([
                                { key: 'enrolled', label: 'Enrolled', icon: Users },
                                { key: 'single-enroll', label: 'Add Student', icon: UserPlus },
                                { key: 'bulk-enroll', label: 'Bulk Enroll', icon: Upload },
                                { key: 'history', label: 'History', icon: Clock },
                            ] as { key: TabType; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveTab(key)}
                                    className={`pb-3 px-1 font-medium text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${activeTab === key
                                        ? 'text-[#10B981] border-[#10B981]'
                                        : 'text-gray-500 border-transparent hover:text-gray-700'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tab Content */}
                    <div className="bg-white rounded-xl shadow">
                        {/* ---- Enrolled Students Tab ---- */}
                        {activeTab === 'enrolled' && (
                            <div className="p-4 sm:p-6">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        Enrolled Students
                                        <span className="ml-2 text-sm font-normal text-gray-500">
                                            ({enrolledStudents.length} student{enrolledStudents.length !== 1 ? 's' : ''})
                                        </span>
                                    </h3>
                                </div>

                                {isLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
                                    </div>
                                ) : enrolledStudents.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p className="text-sm">No students enrolled in this section</p>
                                        <button
                                            onClick={() => setActiveTab('single-enroll')}
                                            className="mt-3 text-sm text-[#10B981] hover:underline"
                                        >
                                            Add students →
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {/* Desktop Table */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full">
                                                <thead className="bg-gray-50 border-b">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Student</th>
                                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Email</th>
                                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Roll No.</th>
                                                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Attendance</th>
                                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {enrolledStudents.map((student) => (
                                                        <tr key={student.enrollment_id} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3">
                                                                <p className="text-sm font-medium text-gray-900">{student.full_name || student.username}</p>
                                                                <p className="text-xs text-gray-500">@{student.username}</p>
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-gray-600">{student.email}</td>
                                                            <td className="px-4 py-3 text-sm text-gray-600">{student.roll_number || '—'}</td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${(student.attendance_percentage || 0) >= 75
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : (student.attendance_percentage || 0) >= 50
                                                                        ? 'bg-yellow-100 text-yellow-700'
                                                                        : 'bg-red-100 text-red-700'
                                                                    }`}>
                                                                    {student.attendance_percentage ?? 0}%
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right">
                                                                <button
                                                                    onClick={() => handleRemoveStudent(student.student_id, student.full_name || student.username)}
                                                                    className="text-red-400 hover:text-red-600 transition-colors"
                                                                    title="Remove student"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Mobile Cards */}
                                        <div className="md:hidden space-y-3">
                                            {enrolledStudents.map((student) => (
                                                <div key={student.enrollment_id} className="border border-gray-200 rounded-lg p-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-gray-900 truncate">{student.full_name || student.username}</p>
                                                            <p className="text-xs text-gray-500 truncate">{student.email}</p>
                                                            <div className="flex items-center gap-2 mt-1.5">
                                                                {student.roll_number && (
                                                                    <span className="text-xs text-gray-500">#{student.roll_number}</span>
                                                                )}
                                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${(student.attendance_percentage || 0) >= 75
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : 'bg-red-100 text-red-700'
                                                                    }`}>
                                                                    {student.attendance_percentage ?? 0}% att.
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveStudent(student.student_id, student.full_name || student.username)}
                                                            className="text-red-400 hover:text-red-600 flex-shrink-0"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ---- Single Enroll Tab ---- */}
                        {activeTab === 'single-enroll' && (
                            <div className="p-4 sm:p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Student to Section</h3>

                                {/* Search */}
                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onKeyUp={() => loadAvailableStudents()}
                                        placeholder="Search students by name, email, or username..."
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                                    />
                                </div>

                                {/* Available Students */}
                                {availableStudents.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">{searchTerm ? 'No matching students found' : 'Type to search for available students'}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {availableStudents.map((student) => (
                                            <div
                                                key={student.id}
                                                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-gray-900">{student.full_name}</p>
                                                    <p className="text-xs text-gray-500">{student.email} · @{student.username}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleSingleEnroll(student.id)}
                                                    disabled={isEnrolling}
                                                    className="ml-3 px-3 py-1.5 bg-[#10B981] text-white rounded-lg text-xs font-medium hover:bg-[#059669] transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                                >
                                                    {isEnrolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                                    Enroll
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ---- Bulk Enroll Tab ---- */}
                        {activeTab === 'bulk-enroll' && (
                            <div className="p-4 sm:p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Bulk Enroll Students</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Enter student IDs (one per line or comma-separated) or upload a CSV file.
                                </p>

                                {/* Text Input */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Student IDs</label>
                                    <textarea
                                        value={bulkInput}
                                        onChange={(e) => setBulkInput(e.target.value)}
                                        placeholder={"student-id-001\nstudent-id-002\nstudent-id-003"}
                                        rows={6}
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981] font-mono resize-y"
                                    />
                                </div>

                                {/* OR divider */}
                                <div className="flex items-center gap-3 my-4">
                                    <div className="flex-1 h-px bg-gray-200" />
                                    <span className="text-xs text-gray-400 font-medium">OR</span>
                                    <div className="flex-1 h-px bg-gray-200" />
                                </div>

                                {/* CSV Upload */}
                                <div className="mb-6">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV</label>
                                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-[#10B981] transition-colors">
                                        <input
                                            type="file"
                                            accept=".csv,.txt"
                                            onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                                            className="hidden"
                                            id="csv-upload"
                                        />
                                        <label htmlFor="csv-upload" className="cursor-pointer">
                                            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                            {csvFile ? (
                                                <p className="text-sm text-[#10B981] font-medium">{csvFile.name}</p>
                                            ) : (
                                                <p className="text-sm text-gray-500">Click to upload CSV file</p>
                                            )}
                                        </label>
                                    </div>
                                </div>

                                {/* Submit */}
                                <button
                                    onClick={handleBulkEnroll}
                                    disabled={isEnrolling || (!bulkInput.trim() && !csvFile)}
                                    className="w-full py-2.5 bg-[#10B981] text-white rounded-lg font-medium hover:bg-[#059669] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                                >
                                    {isEnrolling ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Enrolling...</>
                                    ) : (
                                        <><UserPlus className="w-4 h-4" /> Bulk Enroll Students</>
                                    )}
                                </button>

                                {/* Bulk Result */}
                                {bulkResult && (
                                    <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-2">
                                        <p className="text-sm font-medium text-gray-900">
                                            ✅ Enrolled: {bulkResult.enrolled.length} student{bulkResult.enrolled.length !== 1 ? 's' : ''}
                                        </p>
                                        {bulkResult.skipped.length > 0 && (
                                            <div>
                                                <p className="text-sm font-medium text-amber-700">
                                                    ⚠️ Skipped: {bulkResult.skipped.length}
                                                </p>
                                                <ul className="mt-1 space-y-1">
                                                    {bulkResult.skipped.map((s, i) => (
                                                        <li key={i} className="text-xs text-gray-600">
                                                            {s.student_id}: {s.reason}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ---- History Tab ---- */}
                        {activeTab === 'history' && (
                            <div className="p-4 sm:p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Enrollment History</h3>
                                {auditHistory.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No enrollment activity recorded yet</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {auditHistory.map((entry) => (
                                            <div key={entry.id} className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg">
                                                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${entry.action === 'enrolled' ? 'bg-green-500' : 'bg-red-500'
                                                    }`} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-gray-900">
                                                        Student <span className="font-mono text-xs bg-gray-100 px-1 rounded">{entry.student_id.slice(0, 12)}...</span>
                                                        {' '}<span className={entry.action === 'enrolled' ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                                                            {entry.action}
                                                        </span>
                                                    </p>
                                                    {entry.reason && (
                                                        <p className="text-xs text-gray-500 mt-0.5">Reason: {entry.reason}</p>
                                                    )}
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        {new Date(entry.created_at).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* No section selected state */}
            {!selectedSectionId && (
                <div className="bg-white rounded-xl shadow p-8 text-center">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-gray-500 text-sm">Select a section above to manage enrollments</p>
                </div>
            )}
        </div>
    );
};

export default AdminEnrollmentCenter;
