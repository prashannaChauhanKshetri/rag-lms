import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Upload,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  File,
  Calendar,
  User,
  BookOpen,
  Send,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

interface PendingAssignment {
  id: string;
  title: string;
  description: string;
  section_name: string;
  teacher_name: string;
  due_date: string;
  instructions: string;
  max_score: number;
  submission_deadline: string;
  allow_late_submission: boolean;
}

const StudentAssignmentSubmission: React.FC = () => {
  const { success, error: showError } = useToast();
  const [assignments, setAssignments] = useState<PendingAssignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<PendingAssignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [submissionData, setSubmissionData] = useState({
    content_text: '',
    file: null as File | null,
  });

  const loadAssignments = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await api.get('/student/assignments/pending') as {
        assignments: PendingAssignment[];
      };
      setAssignments(response.assignments || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      showError(error.response?.data?.detail || 'Failed to load assignments');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedAssignment) return;

    if (!submissionData.content_text && !submissionData.file) {
      showError('Please provide either text content or upload a file');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('assignment_id', selectedAssignment.id);

      if (submissionData.content_text) {
        formData.append('content_text', submissionData.content_text);
      }

      if (submissionData.file) {
        formData.append('file', submissionData.file);
      }

      await api.post('/student/assignments/submit', formData);
      success(`Assignment "${selectedAssignment.title}" submitted successfully!`);

      // Clear form
      setSubmissionData({ content_text: '', file: null });
      setSelectedAssignment(null);

      // Reload assignments
      await loadAssignments();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      showError(error.response?.data?.detail || 'Failed to submit assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOverdue = selectedAssignment
    ? new Date() > new Date(selectedAssignment.submission_deadline)
    : false;

  const daysUntilDue = selectedAssignment
    ? Math.ceil(
        (new Date(selectedAssignment.submission_deadline).getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="p-3 bg-blue-100 rounded-lg flex-shrink-0">
              <Upload className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Submit Assignments</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">
                {assignments.length} assignment{assignments.length !== 1 ? 's' : ''} awaiting submission
              </p>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {/* Toast notifications handled by ToastContainer component */}

        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="bg-white rounded-lg sm:rounded-xl p-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-600" />
            <p className="text-gray-600 text-lg">No pending assignments!</p>
            <p className="text-gray-500 text-sm mt-2">All your assignments are submitted.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Assignments List */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Pending Assignments</h2>
              {assignments.map((assignment) => (
                <button
                  key={assignment.id}
                  onClick={() => {
                    setSelectedAssignment(assignment);
                    setSubmissionData({ content_text: '', file: null });
                  }}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedAssignment?.id === assignment.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <h3 className="font-semibold text-gray-900 text-sm sm:text-base break-words">
                    {assignment.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">{assignment.section_name}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    <span>{new Date(assignment.due_date).toLocaleDateString()}</span>
                  </div>

                  {new Date() > new Date(assignment.submission_deadline) && (
                    <div className="mt-2 inline-block px-2 py-1 bg-red-100 text-red-700 text-xs rounded font-medium">
                      Overdue
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Submission Form */}
            <div className="lg:col-span-2">
              {selectedAssignment ? (
                <div className="bg-white rounded-lg sm:rounded-xl shadow p-6 sm:p-8 sticky top-4">
                  {/* Assignment Details */}
                  <div className="mb-6 pb-6 border-b border-gray-200">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
                      {selectedAssignment.title}
                    </h2>

                    <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                      <div className="flex items-start gap-2">
                        <BookOpen className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600">Course</p>
                          <p className="font-medium text-gray-900">{selectedAssignment.section_name}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600">Instructor</p>
                          <p className="font-medium text-gray-900">{selectedAssignment.teacher_name}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600">Due Date</p>
                          <p className="font-medium text-gray-900">
                            {new Date(selectedAssignment.submission_deadline).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-gray-600">Max Score</p>
                          <p className="font-medium text-gray-900">{selectedAssignment.max_score}</p>
                        </div>
                      </div>
                    </div>

                    {isOverdue && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 mb-4">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-red-900">This assignment is overdue</p>
                          <p className="text-xs text-red-700 mt-1">
                            {selectedAssignment.allow_late_submission
                              ? 'Late submissions are allowed'
                              : 'Late submissions are not allowed'}
                          </p>
                        </div>
                      </div>
                    )}

                    {daysUntilDue > 0 && !isOverdue && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-900 font-medium">
                          {daysUntilDue} day{daysUntilDue !== 1 ? 's' : ''} left to submit
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Instructions */}
                  {selectedAssignment.instructions && (
                    <div className="mb-6 pb-6 border-b border-gray-200">
                      <h3 className="font-semibold text-gray-900 mb-2">Instructions</h3>
                      <div
                        className="text-sm text-gray-700 prose max-w-none"
                        dangerouslySetInnerHTML={{ __html: selectedAssignment.instructions }}
                      />
                    </div>
                  )}

                  {/* Submission Form */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Your Response *
                      </label>
                      <textarea
                        value={submissionData.content_text}
                        onChange={(e) =>
                          setSubmissionData({ ...submissionData, content_text: e.target.value })
                        }
                        placeholder="Type your response or answer here..."
                        rows={6}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        {submissionData.content_text.length} characters
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Or Upload File (Optional)
                      </label>
                      <div className="relative">
                        <input
                          type="file"
                          onChange={(e) =>
                            setSubmissionData({
                              ...submissionData,
                              file: e.target.files?.[0] || null,
                            })
                          }
                          className="hidden"
                          id="file-upload"
                        />
                        <label
                          htmlFor="file-upload"
                          className="flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
                        >
                          <File className="w-5 h-5 text-gray-400" />
                          <div className="text-sm text-gray-600">
                            {submissionData.file ? (
                              <span className="font-medium text-blue-600">{submissionData.file.name}</span>
                            ) : (
                              <>
                                <span className="font-medium text-blue-600">Choose a file</span>
                                <span className="text-gray-500"> or drag and drop</span>
                              </>
                            )}
                          </div>
                        </label>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">PDF, DOC, DOCX, TXT up to 10MB</p>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAssignment(null);
                          setSubmissionData({ content_text: '', file: null });
                        }}
                        className="flex-1 px-4 py-3 border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Submit Assignment
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="bg-white rounded-lg sm:rounded-xl p-12 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600">Select an assignment to submit</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentAssignmentSubmission;
