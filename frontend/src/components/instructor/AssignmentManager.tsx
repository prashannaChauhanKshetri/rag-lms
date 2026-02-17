import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
    Plus,
    Trash2,
    Send,
    FileText,
    Check,
    Users,
    Clock,
    BarChart3,
    Eye,
    AlertCircle,
    CheckCircle2,
    Loader2
} from 'lucide-react';
import { AssignmentSubmissions } from './AssignmentSubmissions';

interface Assignment {
    id: string;
    title: string;
    description: string;
    due_date: string;
    points: number;
    status: 'draft' | 'published';
    created_at: string;
    submission_count?: number;
    submitted_count?: number;
    // New fields
    chatbot_id: string;
    section_id?: string;
}

interface Submission {
    id: string;
    assignment_id: string;
    student_id: string;
    student_name?: string;
    file_path?: string;
    text?: string;
    score?: number;
    feedback?: string;
    submitted_at: string;
    status: 'submitted' | 'graded' | 'late';
}

interface TeachingUnit {
    section_id: string;
    section_name: string;
    class_id: string;
    class_name: string;
    chatbot_id: string;
    chatbot_name: string;
}

type TabType = 'assignments' | 'submissions' | 'grading' | 'stats';

export function AssignmentManager() {
    const [units, setUnits] = useState<TeachingUnit[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<TeachingUnit | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('assignments');

    // Form states
    const [showForm, setShowForm] = useState(false);
    const [viewingAssignment, setViewingAssignment] = useState<Assignment | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newDate, setNewDate] = useState('');
    const [newPoints, setNewPoints] = useState('100');
    const [newFile, setNewFile] = useState<File | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Submissions and grading states
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [gradingScore, setGradingScore] = useState('');
    const [gradingFeedback, setGradingFeedback] = useState('');
    const [isGrading, setIsGrading] = useState(false);

    useEffect(() => {
        fetchTeachingUnits();
    }, []);

    useEffect(() => {
        if (selectedUnit) {
            fetchAssignments();
        }
    }, [selectedUnit]);

    const fetchTeachingUnits = async () => {
        try {
            const data = await api.get<{ units: TeachingUnit[] }>('/instructor/teaching-units');
            setUnits(data.units);
            if (data.units.length > 0) setSelectedUnit(data.units[0]);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAssignments = async () => {
        if (!selectedUnit) return;
        try {
            // Fetch all assignments for the chatbot, then filter by section on client side
            // Ideally backend should support filtering, but list_assignments_by_chatbot returns section_id
            const data = await api.get<{ assignments: Assignment[] }>(`/instructor/assignments/${selectedUnit.chatbot_id}`);

            // Filter assignments that belong to this section
            const filtered = data.assignments.filter(a => a.section_id === selectedUnit.section_id);
            setAssignments(filtered);
        } catch (error) {
            console.error(error);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUnit) return;

        setIsCreating(true);
        try {
            const formData = new FormData();
            formData.append('chatbot_id', selectedUnit.chatbot_id);
            formData.append('section_id', selectedUnit.section_id);
            formData.append('title', newTitle);
            formData.append('description', newDesc);
            formData.append('due_date', newDate);
            formData.append('points', newPoints);
            if (newFile) {
                formData.append('file', newFile);
            }

            await api.post('/instructor/assignments/create', formData);
            setShowForm(false);
            setNewTitle('');
            setNewDesc('');
            setNewDate('');
            setNewPoints('100');
            setNewFile(null);
            await fetchAssignments();
        } catch {
            alert('Failed to create assignment');
        } finally {
            setIsCreating(false);
        }
    };

    const handlePublish = async (id: string) => {
        try {
            await api.post(`/instructor/assignments/${id}/publish`, {});
            await fetchAssignments();
        } catch {
            alert('Failed to publish');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        try {
            await api.delete(`/instructor/assignments/${id}`);
            await fetchAssignments();
        } catch {
            alert('Failed to delete');
        }
    };

    const handleGradeSubmission = async () => {
        if (!selectedSubmission || !gradingScore) {
            alert('Please enter a score');
            return;
        }

        setIsGrading(true);
        try {
            await api.post(`/instructor/submissions/${selectedSubmission.id}/grade`, {
                score: parseFloat(gradingScore),
                feedback: gradingFeedback
            });
            setSelectedSubmission(null);
            setGradingScore('');
            setGradingFeedback('');
            // Refresh submissions
            if (viewingAssignment) {
                const data = await api.get<{ submissions: Submission[] }>(`/instructor/assignments/${viewingAssignment.id}/submissions`);
                setSubmissions(data.submissions);
            }
        } catch {
            alert('Failed to grade submission');
        } finally {
            setIsGrading(false);
        }
    };

    const publishedAssignments = assignments.filter(a => a.status === 'published');
    const draftAssignments = assignments.filter(a => a.status === 'draft');
    const totalSubmissions = assignments.reduce((sum, a) => sum + (a.submitted_count || 0), 0);
    const totalToGrade = assignments.reduce((sum, a) => sum + ((a.submission_count || 0) - (a.submitted_count || 0)), 0);

    return (
        <div className="h-full flex flex-col gap-6 p-4 md:p-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <FileText className="w-8 h-8 text-blue-600" />
                        <span className="hidden sm:inline">Assignment Manager</span>
                        <span className="sm:hidden">Assignments</span>
                    </h1>
                    <select
                        value={selectedUnit ? `${selectedUnit.chatbot_id}|${selectedUnit.section_id}` : ''}
                        onChange={(e) => {
                            const [cbId, secId] = e.target.value.split('|');
                            const unit = units.find(u => u.chatbot_id === cbId && u.section_id === secId);
                            setSelectedUnit(unit || null);
                        }}
                        className="px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                        {units.map(u => (
                            <option key={`${u.chatbot_id}|${u.section_id}`} value={`${u.chatbot_id}|${u.section_id}`}>
                                {u.class_name} - {u.section_name} ({u.chatbot_name})
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium w-full sm:w-auto"
                >
                    <Plus className="w-5 h-5" />
                    New Assignment
                </button>
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-gray-200 overflow-x-auto">
                <div className="flex gap-6">
                    <button
                        onClick={() => setActiveTab('assignments')}
                        className={`pb-4 px-2 font-medium whitespace-nowrap transition-colors border-b-2 ${activeTab === 'assignments'
                            ? 'text-blue-600 border-blue-600'
                            : 'text-gray-600 border-transparent hover:text-gray-900'
                            }`}
                    >
                        <FileText className="inline w-5 h-5 mr-2" />
                        Assignments
                    </button>
                    <button
                        onClick={() => setActiveTab('submissions')}
                        className={`pb-4 px-2 font-medium whitespace-nowrap transition-colors border-b-2 ${activeTab === 'submissions'
                            ? 'text-blue-600 border-blue-600'
                            : 'text-gray-600 border-transparent hover:text-gray-900'
                            }`}
                    >
                        <Users className="inline w-5 h-5 mr-2" />
                        Submissions {submissions.length > 0 && <span className="ml-1 badge">{submissions.length}</span>}
                    </button>
                    <button
                        onClick={() => setActiveTab('grading')}
                        className={`pb-4 px-2 font-medium whitespace-nowrap transition-colors border-b-2 ${activeTab === 'grading'
                            ? 'text-blue-600 border-blue-600'
                            : 'text-gray-600 border-transparent hover:text-gray-900'
                            }`}
                    >
                        <Check className="inline w-5 h-5 mr-2" />
                        Grading {totalToGrade > 0 && <span className="ml-1 text-red-600 font-bold">({totalToGrade})</span>}
                    </button>
                    <button
                        onClick={() => setActiveTab('stats')}
                        className={`pb-4 px-2 font-medium whitespace-nowrap transition-colors border-b-2 ${activeTab === 'stats'
                            ? 'text-blue-600 border-blue-600'
                            : 'text-gray-600 border-transparent hover:text-gray-900'
                            }`}
                    >
                        <BarChart3 className="inline w-5 h-5 mr-2" />
                        Statistics
                    </button>
                </div>
            </div>

            {/* Create Form */}
            {showForm && (
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                    <h3 className="text-xl font-bold mb-4">Create New Assignment</h3>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Title</label>
                                <input
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                                    placeholder="e.g. Week 4 Research Paper"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Points</label>
                                <input
                                    type="number"
                                    value={newPoints}
                                    onChange={e => setNewPoints(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                                    placeholder="100"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Due Date</label>
                            <input
                                type="datetime-local"
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Description</label>
                            <textarea
                                value={newDesc}
                                onChange={e => setNewDesc(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 h-24"
                                placeholder="Instructions for students..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Attachment (Optional)</label>
                            <input
                                type="file"
                                onChange={e => setNewFile(e.target.files?.[0] || null)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isCreating}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                                {isCreating ? 'Creating...' : 'Create Assignment'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Tab Content */}
            <div className="flex-1">
                {/* Assignments Tab */}
                {activeTab === 'assignments' && (
                    <div className="space-y-4">
                        {draftAssignments.length > 0 && (
                            <div>
                                <h3 className="text-lg font-bold mb-3 text-gray-700">Drafts</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {draftAssignments.map(a => (
                                        <AssignmentCard
                                            key={a.id}
                                            assignment={a}
                                            onPublish={handlePublish}
                                            onDelete={handleDelete}
                                            onView={() => setViewingAssignment(a)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        {publishedAssignments.length > 0 && (
                            <div>
                                <h3 className="text-lg font-bold mb-3 text-gray-700">Published</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {publishedAssignments.map(a => (
                                        <AssignmentCard
                                            key={a.id}
                                            assignment={a}
                                            onPublish={handlePublish}
                                            onDelete={handleDelete}
                                            onView={() => setViewingAssignment(a)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        {assignments.length === 0 && !isLoading && (
                            <div className="col-span-full py-12 text-center text-gray-400">
                                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                No assignments found. Create one above.
                            </div>
                        )}
                    </div>
                )}

                {/* Statistics Tab */}
                {activeTab === 'stats' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard label="Total Assignments" value={assignments.length} icon={<FileText />} />
                        <StatCard label="Published" value={publishedAssignments.length} icon={<Check />} />
                        <StatCard label="Total Submissions" value={totalSubmissions} icon={<Users />} />
                        <StatCard label="Pending Grading" value={totalToGrade} icon={<AlertCircle />} color="red" />
                    </div>
                )}

                {/* Submissions Tab */}
                {activeTab === 'submissions' && (
                    <SubmissionsTab
                        assignments={publishedAssignments}
                        onSelectAssignment={setViewingAssignment}
                    />
                )}

                {/* Grading Tab */}
                {activeTab === 'grading' && (
                    <GradingTab
                        assignments={publishedAssignments}
                        onSelectSubmission={setSelectedSubmission}
                        selectedSubmission={selectedSubmission}
                        gradingScore={gradingScore}
                        setGradingScore={setGradingScore}
                        gradingFeedback={gradingFeedback}
                        setGradingFeedback={setGradingFeedback}
                        isGrading={isGrading}
                        onSubmitGrade={handleGradeSubmission}
                    />
                )}
            </div>

            {/* Submission Viewer Modal */}
            {viewingAssignment && (
                <AssignmentSubmissions
                    assignmentId={viewingAssignment.id}
                    assignmentTitle={viewingAssignment.title}
                    onClose={() => setViewingAssignment(null)}
                />
            )}
        </div>
    );
}

interface AssignmentCardProps {
    assignment: Assignment;
    onPublish: (id: string) => void;
    onDelete: (id: string) => void;
    onView: () => void;
}

function AssignmentCard({ assignment, onPublish, onDelete, onView }: AssignmentCardProps) {
    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg">{assignment.title}</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${assignment.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {assignment.status}
                </span>
            </div>
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">{assignment.description}</p>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <Clock className="w-4 h-4" />
                Due: {new Date(assignment.due_date).toLocaleDateString()}
            </div>
            <div className="flex gap-2 pt-2 border-t flex-wrap">
                {assignment.status === 'draft' ? (
                    <button
                        onClick={() => onPublish(assignment.id)}
                        className="flex-1 min-w-24 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                        <Send className="w-4 h-4" />
                        Publish
                    </button>
                ) : (
                    <button
                        onClick={onView}
                        className="flex-1 min-w-24 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                        <Eye className="w-4 h-4" />
                        View
                    </button>
                )}
                <button
                    onClick={() => onDelete(assignment.id)}
                    className="flex-1 min-w-24 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center gap-2"
                >
                    <Trash2 className="w-4 h-4" />
                    Delete
                </button>
            </div>
        </div>
    );
}

interface StatCardProps {
    label: string;
    value: number;
    icon: React.ReactNode;
    color?: 'blue' | 'green' | 'red';
}

function StatCard({ label, value, icon, color = 'blue' }: StatCardProps) {
    const colorClasses = {
        blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-900',
        green: 'from-green-50 to-green-100 border-green-200 text-green-900',
        red: 'from-red-50 to-red-100 border-red-200 text-red-900'
    };

    return (
        <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-xl p-6 border shadow-sm`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium opacity-75 mb-1">{label}</p>
                    <p className="text-4xl font-bold">{value}</p>
                </div>
                <div className="opacity-50">{icon}</div>
            </div>
        </div>
    );
}

interface SubmissionsTabProps {
    assignments: Assignment[];
    onSelectAssignment: (assignment: Assignment) => void;
}

function SubmissionsTab({ assignments, onSelectAssignment }: SubmissionsTabProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assignments.map(a => (
                <div
                    key={a.id}
                    onClick={() => onSelectAssignment(a)}
                    className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
                >
                    <h3 className="font-bold text-lg mb-2">{a.title}</h3>
                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                        <p className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            {a.submitted_count || 0} submissions
                        </p>
                        <p className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Due: {new Date(a.due_date).toLocaleDateString()}
                        </p>
                    </div>
                    <button className="w-full py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium text-sm">
                        View Submissions →
                    </button>
                </div>
            ))}
        </div>
    );
}

interface GradingTabProps {
    assignments: Assignment[];
    onSelectSubmission: (submission: Submission | null) => void;
    selectedSubmission: Submission | null;
    gradingScore: string;
    setGradingScore: (score: string) => void;
    gradingFeedback: string;
    setGradingFeedback: (feedback: string) => void;
    isGrading: boolean;
    onSubmitGrade: () => void;
}

function GradingTab({
    assignments,
    onSelectSubmission,
    selectedSubmission,
    gradingScore,
    setGradingScore,
    gradingFeedback,
    setGradingFeedback,
    isGrading,
    onSubmitGrade
}: GradingTabProps) {
    return (
        <div className="space-y-4">
            {assignments.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    No assignments published yet.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Submissions List */}
                    <div className="md:col-span-1 bg-white rounded-xl border border-gray-200 p-4 max-h-96 overflow-y-auto">
                        <h3 className="font-bold mb-4">Pending Submissions</h3>
                        <div className="space-y-2">
                            {assignments.map(a => (
                                <div key={a.id} className="text-sm p-2 bg-gray-50 rounded border border-gray-200">
                                    <p className="font-medium">{a.title}</p>
                                    <p className="text-gray-600 text-xs">{a.submitted_count || 0} to grade</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Grading Form */}
                    <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
                        {selectedSubmission ? (
                            <div className="space-y-4">
                                <h3 className="font-bold text-lg">Grade Submission</h3>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Score</label>
                                    <input
                                        type="number"
                                        value={gradingScore}
                                        onChange={e => setGradingScore(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                                        placeholder="Enter score"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Feedback</label>
                                    <textarea
                                        value={gradingFeedback}
                                        onChange={e => setGradingFeedback(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 h-24"
                                        placeholder="Enter feedback for student..."
                                    />
                                </div>
                                <div className="flex gap-2 pt-2 border-t">
                                    <button
                                        onClick={() => onSelectSubmission(null)}
                                        className="flex-1 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={onSubmitGrade}
                                        disabled={isGrading}
                                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isGrading && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {isGrading ? 'Saving...' : 'Submit Grade'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="py-12 text-center text-gray-400">
                                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                Select a submission to grade
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
