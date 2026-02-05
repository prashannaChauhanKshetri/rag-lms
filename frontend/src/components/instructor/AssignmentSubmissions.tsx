import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { X, FileText, Calendar, Download } from 'lucide-react';

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

interface AssignmentSubmissionsProps {
    assignmentId: string;
    assignmentTitle: string;
    onClose: () => void;
}

export function AssignmentSubmissions({ assignmentId, assignmentTitle, onClose }: AssignmentSubmissionsProps) {
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');
    const [isGrading, setIsGrading] = useState(false);

    const fetchSubmissions = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await api.get<{ submissions: Submission[] }>(
                `/instructor/assignments/${assignmentId}/submissions`
            );
            setSubmissions(data.submissions);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [assignmentId]);

    useEffect(() => {
        fetchSubmissions();
    }, [fetchSubmissions]);

    const handleGradeSubmit = async () => {
        if (!selectedSubmission || !grade) return;

        const gradeNum = parseFloat(grade);
        if (isNaN(gradeNum) || gradeNum < 0 || gradeNum > 100) {
            alert('Please enter a valid grade between 0 and 100');
            return;
        }

        setIsGrading(true);
        try {
            await api.post('/instructor/assignments/grade', {
                submission_id: selectedSubmission.id,
                grade: gradeNum,
                feedback: feedback
            });

            alert('Graded successfully!');
            setSelectedSubmission(null);
            setGrade('');
            setFeedback('');
            fetchSubmissions(); // Reload to show updated grades
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to grade submission');
        } finally {
            setIsGrading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Submissions</h2>
                        <p className="text-gray-600 mt-1">{assignmentTitle}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Submissions List */}
                {isLoading ? (
                    <div className="text-center py-12 text-gray-500">Loading submissions...</div>
                ) : submissions.length === 0 ? (
                    <div className="text-center py-12">
                        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No submissions yet</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {submissions.map(submission => (
                            <div
                                key={submission.id}
                                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="font-semibold text-gray-900">{submission.student_name}</h3>
                                            {submission.grade !== null && submission.grade !== undefined ? (
                                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                                    Graded: {submission.grade}/100
                                                </span>
                                            ) : (
                                                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                                                    Pending
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-4 text-sm text-gray-600">
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-4 h-4" />
                                                <span>Submitted {formatDate(submission.submitted_at)}</span>
                                            </div>
                                            <a
                                                href={`/api/${submission.file_path}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                                            >
                                                <FileText className="w-4 h-4" />
                                                <span className="font-mono underline decoration-dotted">{submission.file_name}</span>
                                                <Download className="w-3 h-3" />
                                            </a>
                                        </div>

                                        {submission.feedback && (
                                            <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                                                <p className="text-sm text-blue-900"><strong>Feedback:</strong> {submission.feedback}</p>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => {
                                            setSelectedSubmission(submission);
                                            setGrade(submission.grade?.toString() || '');
                                            setFeedback(submission.feedback || '');
                                        }}
                                        className="ml-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                                    >
                                        {submission.grade !== null && submission.grade !== undefined ? 'Edit Grade' : 'Grade'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Grading Modal */}
                {selectedSubmission && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]" onClick={() => setSelectedSubmission(null)}>
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-xl font-bold text-gray-900">Grade Submission</h3>
                                <button onClick={() => setSelectedSubmission(null)} className="p-1 hover:bg-gray-100 rounded">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="mb-4">
                                <p className="text-gray-700"><strong>Student:</strong> {selectedSubmission.student_name}</p>
                                <p className="text-gray-600 text-sm mt-1">
                                    <strong>File:</strong> <span className="font-mono">{selectedSubmission.file_name}</span>
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Grade (0-100)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={grade}
                                        onChange={(e) => setGrade(e.target.value)}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="Enter grade"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Feedback (optional)
                                    </label>
                                    <textarea
                                        value={feedback}
                                        onChange={(e) => setFeedback(e.target.value)}
                                        rows={4}
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                                        placeholder="Provide feedback for the student..."
                                    />
                                </div>

                                <button
                                    onClick={handleGradeSubmit}
                                    disabled={isGrading || !grade}
                                    className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2"
                                >
                                    {isGrading ? 'Submitting...' : 'Submit Grade'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
