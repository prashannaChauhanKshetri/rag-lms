import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Chatbot } from '../../types';
import { FileText, Calendar, Clock, BookOpen, AlertCircle, Upload, X, CheckCircle, Eye } from 'lucide-react';

interface Assignment {
    id: string;
    title: string;
    description: string;
    due_date: string;
    is_published: boolean;
    created_at: string;
}

interface Submission {
    id: string;
    assignment_id: string;
    student_id: string;
    student_name: string;
    file_path: string;
    file_name: string;
    submitted_at: string;
    grade?: number;
    feedback?: string;
}

export function StudentAssignments() {
    const [courses, setCourses] = useState<Chatbot[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Modal state
    const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissions, setSubmissions] = useState<Record<string, Submission>>({});

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const data = await api.get<{ chatbots: Chatbot[] }>('/chatbots/list');
                setCourses(data.chatbots);
                if (data.chatbots.length > 0) setSelectedCourseId(data.chatbots[0].id);
            } catch (error) {
                console.error(error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchCourses();
    }, []);

    useEffect(() => {
        const fetchAssignments = async () => {
            if (!selectedCourseId) return;
            try {
                const data = await api.get<{ assignments: Assignment[] }>(`/student/assignments/chatbot/${selectedCourseId}`);
                const published = data.assignments.filter(a => a.is_published !== false); // Backend already filters, but safety fallback
                setAssignments(published);

                // Check submission status for each assignment
                const userId = localStorage.getItem('user_id') || 'demo_student';
                for (const assignment of published) {
                    try {
                        const subData = await api.get<{ submission: Submission | null }>(
                            `/student/assignments/${assignment.id}/submission?student_id=${userId}`
                        );
                        if (subData.submission) {
                            setSubmissions(prev => ({
                                ...prev,
                                [assignment.id]: subData.submission as Submission
                            }));
                        }
                    } catch {
                        // No submission yet
                    }
                }
            } catch (error) {
                console.error(error);
                setAssignments([]);
            }
        };

        if (selectedCourseId) {
            fetchAssignments();
        }
    }, [selectedCourseId]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleSubmit = async () => {
        if (!selectedFile || !selectedAssignment) return;

        setIsSubmitting(true);
        try {
            const userName = localStorage.getItem('user_name') || 'Student';
            const userId = localStorage.getItem('user_id') || 'demo_student';

            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('assignment_id', selectedAssignment.id);
            formData.append('student_id', userId);
            formData.append('student_name', userName);

            await api.post('/student/assignments/submit', formData);

            alert('Assignment submitted successfully!');
            setSelectedAssignment(null);
            setSelectedFile(null);

            // Reload to update submission status
            window.location.reload();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to submit assignment');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isOverdue = (dueDate: string) => {
        return new Date(dueDate) < new Date();
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-pulse text-gray-500">Loading assignments...</div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="w-6 h-6 text-blue-600" />
                    My Assignments
                </h1>
                <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="px-4 py-2 border rounded-lg bg-white shadow-sm"
                >
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            {/* Assignments Grid */}
            {assignments.length === 0 ? (
                <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No assignments yet for this course</p>
                    <p className="text-gray-400 text-sm mt-2">Check back later for new assignments from your instructor</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {assignments.map(assignment => {
                        const overdue = isOverdue(assignment.due_date);
                        const submission = submissions[assignment.id];
                        const isSubmitted = !!submission;

                        return (
                            <div
                                key={assignment.id}
                                className={`bg-white rounded-xl border-2 p-5 shadow-sm hover:shadow-md transition-all cursor-pointer ${isSubmitted ? 'border-green-200 bg-green-50/30' :
                                    overdue ? 'border-red-200 bg-red-50/30' :
                                        'border-gray-200 hover:border-blue-300'
                                    }`}
                                onClick={() => setSelectedAssignment(assignment)}
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-2 rounded-lg ${isSubmitted ? 'bg-green-100' :
                                            overdue ? 'bg-red-100' : 'bg-blue-100'
                                            }`}>
                                            <FileText className={`w-5 h-5 ${isSubmitted ? 'text-green-600' :
                                                overdue ? 'text-red-600' : 'text-blue-600'
                                                }`} />
                                        </div>
                                    </div>
                                    {isSubmitted ? (
                                        <div className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                                            <CheckCircle className="w-3 h-3" />
                                            Submitted
                                        </div>
                                    ) : overdue && (
                                        <div className="flex items-center gap-1 text-xs text-red-600 bg-red-100 px-2 py-1 rounded-full">
                                            <AlertCircle className="w-3 h-3" />
                                            Overdue
                                        </div>
                                    )}
                                </div>

                                {/* Title */}
                                <h3 className="font-bold text-lg mb-2 text-gray-900">{assignment.title}</h3>

                                {/* Description */}
                                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                                    {assignment.description || 'No description provided'}
                                </p>

                                {/* Due Date */}
                                <div className={`flex items-center gap-2 text-sm ${isSubmitted ? 'text-green-600' :
                                    overdue ? 'text-red-600' : 'text-gray-600'
                                    }`}>
                                    <Clock className="w-4 h-4" />
                                    <span className="font-medium">Due:</span>
                                    <span>{formatDate(assignment.due_date)}</span>
                                </div>

                                {/* Posted Date */}
                                <div className="flex items-center gap-2 text-xs text-gray-400 mt-2 pt-3 border-t">
                                    <Calendar className="w-3 h-3" />
                                    Posted {formatDate(assignment.created_at)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Course Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                    <h3 className="font-semibold text-blue-900">About Assignments</h3>
                    <p className="text-sm text-blue-700 mt-1">
                        Click on any assignment to view details and submit your work. Supported formats: PDF, DOC, DOCX, TXT
                    </p>
                </div>
            </div>

            {/* Assignment Detail Modal */}
            {selectedAssignment && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedAssignment(null)}>
                    <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">{selectedAssignment.title}</h2>
                                <p className="text-sm text-gray-500 mt-1">Posted {formatDate(selectedAssignment.created_at)}</p>
                            </div>
                            <button
                                onClick={() => setSelectedAssignment(null)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Due Date */}
                        <div className={`flex items-center gap-2 p-3 rounded-lg mb-4 ${isOverdue(selectedAssignment.due_date) ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                            }`}>
                            <Clock className="w-5 h-5" />
                            <span className="font-medium">Due: {formatDate(selectedAssignment.due_date)}</span>
                        </div>

                        {/* Description */}
                        <div className="mb-6">
                            <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
                            <p className="text-gray-700 whitespace-pre-wrap">
                                {selectedAssignment.description || 'No description provided'}
                            </p>
                        </div>

                        {/* Grade Display (if graded) */}
                        {submissions[selectedAssignment.id]?.grade !== null &&
                            submissions[selectedAssignment.id]?.grade !== undefined && (
                                <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">
                                            {submissions[selectedAssignment.id].grade}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-green-900">Graded!</h3>
                                            <p className="text-sm text-green-700">Score: {submissions[selectedAssignment.id].grade}/100</p>
                                        </div>
                                    </div>
                                    {submissions[selectedAssignment.id].feedback && (
                                        <div className="mt-3 pt-3 border-t border-green-200">
                                            <h4 className="font-semibold text-gray-900 mb-1">Instructor Feedback:</h4>
                                            <p className="text-gray-700 italic">"{submissions[selectedAssignment.id].feedback}"</p>
                                        </div>
                                    )}
                                </div>
                            )}

                        {/* Submission Status */}
                        {submissions[selectedAssignment.id] ? (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                                <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
                                    <CheckCircle className="w-5 h-5" />
                                    Assignment Submitted
                                </div>
                                <p className="text-sm text-green-600">
                                    Submitted on {formatDate(submissions[selectedAssignment.id].submitted_at)}
                                </p>
                                <p className="text-sm text-green-600 mt-1">
                                    File: <span className="font-mono">{submissions[selectedAssignment.id].file_name}</span>
                                </p>
                            </div>
                        ) : (
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                <h3 className="font-semibold text-gray-900 mb-2">Upload Your Work</h3>
                                <p className="text-sm text-gray-600 mb-4">Supported formats: PDF, DOC, DOCX, TXT</p>

                                {selectedFile ? (
                                    <div className="bg-blue-50 p-3 rounded-lg mb-4">
                                        <div className="flex items-center justify-center gap-2 text-blue-700">
                                            <Eye className="w-4 h-4" />
                                            <span className="font-medium">{selectedFile.name}</span>
                                            <button
                                                onClick={() => setSelectedFile(null)}
                                                className="ml-2 text-red-600 hover:text-red-700"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <input
                                        type="file"
                                        accept=".pdf,.doc,.docx,.txt"
                                        onChange={handleFileSelect}
                                        className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                                    />
                                )}

                                {selectedFile && (
                                    <button
                                        onClick={handleSubmit}
                                        disabled={isSubmitting}
                                        className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? 'Submitting...' : 'Submit Assignment'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
