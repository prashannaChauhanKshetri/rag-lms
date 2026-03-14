import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { Chatbot } from '../../types';
import { CheckCircle2, Eye, Loader2, Megaphone, RefreshCw } from 'lucide-react';

interface QuizOption {
  id: string;
  title: string;
  description?: string;
  question_count?: number;
}

interface QuizSubmission {
  id: string;
  student_id: string;
  student_name?: string;
  submitted_at: string;
  grading_status?: 'draft_review' | 'reviewed' | 'published';
  is_result_published?: boolean;
  score?: number;
  manual_total_score?: number;
  display_score?: number;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: string;
  correct_answer: string;
  options?: string[];
  points: number;
}

interface SubmissionDetailResponse {
  submission: {
    id: string;
    answers: Record<string, string>;
    question_scores?: Record<string, { awarded_points: number; comment?: string }>;
    feedback?: string;
    display_score?: number;
    grading_status?: string;
    is_result_published?: boolean;
  };
  quiz: {
    id: string;
    title: string;
    description?: string;
  };
  questions: QuizQuestion[];
}

interface GradeDraft {
  awarded_points: string;
  comment: string;
}

export function QuizReviewManager() {
  const [courses, setCourses] = useState<Chatbot[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');

  const [quizzes, setQuizzes] = useState<QuizOption[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState('');

  const [submissions, setSubmissions] = useState<QuizSubmission[]>([]);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft_review' | 'reviewed' | 'published'>('all');
  const [onlyUnpublished, setOnlyUnpublished] = useState(false);

  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingQuizzes, setIsLoadingQuizzes] = useState(false);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);

  const [detail, setDetail] = useState<SubmissionDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [gradeDrafts, setGradeDrafts] = useState<Record<string, GradeDraft>>({});
  const [feedback, setFeedback] = useState('');
  const [isSavingGrade, setIsSavingGrade] = useState(false);
  const [isPublishingOne, setIsPublishingOne] = useState(false);
  const [isPublishingBulk, setIsPublishingBulk] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCourses = async () => {
    try {
      setIsLoadingCourses(true);
      const data = await api.get<{ chatbots: Chatbot[] }>('/chatbots/list');
      setCourses(data.chatbots || []);
      if ((data.chatbots || []).length > 0) {
        setSelectedCourseId((current) => current || data.chatbots[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses');
    } finally {
      setIsLoadingCourses(false);
    }
  };

  const loadQuizzes = async (courseId: string) => {
    if (!courseId) {
      setQuizzes([]);
      setSelectedQuizId('');
      return;
    }

    try {
      setIsLoadingQuizzes(true);
      const data = await api.get<{ quizzes: QuizOption[] }>(`/instructor/quizzes/${courseId}`);
      setQuizzes(data.quizzes || []);
      setSelectedQuizId((current) => {
        if (current && (data.quizzes || []).some((q) => q.id === current)) {
          return current;
        }
        return (data.quizzes || [])[0]?.id || '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quizzes');
    } finally {
      setIsLoadingQuizzes(false);
    }
  };

  const loadSubmissions = useCallback(async (quizId: string) => {
    if (!quizId) {
      setSubmissions([]);
      setSelectedSubmissionIds([]);
      setDetail(null);
      return;
    }

    try {
      setIsLoadingSubmissions(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      if (onlyUnpublished) {
        params.set('published', 'false');
      }

      const query = params.toString();
      const endpoint = `/instructor/quizzes/${quizId}/submissions${query ? `?${query}` : ''}`;
      const data = await api.get<{ submissions: QuizSubmission[] }>(endpoint);
      setSubmissions(data.submissions || []);
      setSelectedSubmissionIds([]);
      setDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setIsLoadingSubmissions(false);
    }
  }, [statusFilter, onlyUnpublished]);

  const loadSubmissionDetail = async (submissionId: string) => {
    try {
      setIsLoadingDetail(true);
      const data = await api.get<SubmissionDetailResponse>(`/instructor/quizzes/submissions/${submissionId}`);
      setDetail(data);

      const nextDrafts: Record<string, GradeDraft> = {};
      data.questions.forEach((q) => {
        const prev = data.submission.question_scores?.[q.id];
        nextDrafts[q.id] = {
          awarded_points: prev ? String(prev.awarded_points) : '',
          comment: prev?.comment || ''
        };
      });
      setGradeDrafts(nextDrafts);
      setFeedback(data.submission.feedback || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submission details');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    loadQuizzes(selectedCourseId);
  }, [selectedCourseId]);

  useEffect(() => {
    loadSubmissions(selectedQuizId);
  }, [selectedQuizId, loadSubmissions]);

  const totalAwarded = useMemo(() => {
    if (!detail) return 0;
    return detail.questions.reduce((sum, q) => {
      const val = parseFloat(gradeDrafts[q.id]?.awarded_points || '0');
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);
  }, [detail, gradeDrafts]);

  const totalPossible = useMemo(() => {
    if (!detail) return 0;
    return detail.questions.reduce((sum, q) => sum + (q.points || 0), 0);
  }, [detail]);

  const handleSaveGrades = async () => {
    if (!detail) return;

    const question_grades = detail.questions.map((q) => {
      const raw = parseFloat(gradeDrafts[q.id]?.awarded_points || '0');
      const bounded = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), q.points || 0) : 0;
      return {
        question_id: q.id,
        awarded_points: bounded,
        comment: gradeDrafts[q.id]?.comment || ''
      };
    });

    try {
      setIsSavingGrade(true);
      setError(null);
      setSuccess(null);
      await api.post(`/instructor/quizzes/submissions/${detail.submission.id}/grade`, {
        question_grades,
        feedback
      });
      setSuccess('Grades saved. You can publish when ready.');
      await loadSubmissionDetail(detail.submission.id);
      await loadSubmissions(selectedQuizId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save grades');
    } finally {
      setIsSavingGrade(false);
    }
  };

  const handlePublishOne = async () => {
    if (!detail) return;
    try {
      setIsPublishingOne(true);
      setError(null);
      setSuccess(null);
      await api.post(`/instructor/quizzes/submissions/${detail.submission.id}/publish`, {});
      setSuccess('Selected attempt published to the student.');
      await loadSubmissionDetail(detail.submission.id);
      await loadSubmissions(selectedQuizId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish result');
    } finally {
      setIsPublishingOne(false);
    }
  };

  const handleBulkPublish = async () => {
    if (!selectedQuizId || selectedSubmissionIds.length === 0) return;
    try {
      setIsPublishingBulk(true);
      setError(null);
      setSuccess(null);
      await api.post(`/instructor/quizzes/${selectedQuizId}/publish-results`, {
        submission_ids: selectedSubmissionIds
      });
      setSuccess(`Published ${selectedSubmissionIds.length} attempt(s).`);
      await loadSubmissions(selectedQuizId);
      if (detail && selectedSubmissionIds.includes(detail.submission.id)) {
        await loadSubmissionDetail(detail.submission.id);
      }
      setSelectedSubmissionIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk publish');
    } finally {
      setIsPublishingBulk(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900">Quiz Review & Manual Grading</h2>
        <p className="text-sm text-gray-600 mt-1">Choose a quiz, review each attempt, assign per-question marks, then publish selected attempt results.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Course</label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
              disabled={isLoadingCourses}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quiz</label>
            <select
              value={selectedQuizId}
              onChange={(e) => setSelectedQuizId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-white"
              disabled={isLoadingQuizzes || quizzes.length === 0}
            >
              {quizzes.map((q) => (
                <option key={q.id} value={q.id}>{q.title}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => loadSubmissions(selectedQuizId)}
              className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50"
              disabled={!selectedQuizId || isLoadingSubmissions}
            >
              <span className="inline-flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Refresh</span>
            </button>
            <button
              onClick={handleBulkPublish}
              disabled={selectedSubmissionIds.length === 0 || isPublishingBulk}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {isPublishingBulk ? 'Publishing...' : `Publish Selected (${selectedSubmissionIds.length})`}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'draft_review' | 'reviewed' | 'published')}
              className="px-3 py-2 border rounded-lg text-sm bg-white"
            >
              <option value="all">All</option>
              <option value="draft_review">Draft Review</option>
              <option value="reviewed">Reviewed</option>
              <option value="published">Published</option>
            </select>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onlyUnpublished}
              onChange={(e) => setOnlyUnpublished(e.target.checked)}
            />
            Unpublished Only
          </label>
        </div>

        {error && <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
        {success && <div className="mt-4 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">{success}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900">Attempts</h3>
            {isLoadingSubmissions && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
          </div>

          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
            {!isLoadingSubmissions && submissions.length === 0 && (
              <p className="text-sm text-gray-500 py-6 text-center">No attempts yet for this quiz.</p>
            )}

            {submissions.map((s) => {
              const isSelected = selectedSubmissionIds.includes(s.id);
              return (
                <div key={s.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        setSelectedSubmissionIds((prev) => e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id));
                      }}
                      className="mt-1"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-gray-900 truncate">{s.student_name || s.student_id}</p>
                        <span className={`text-xs px-2 py-1 rounded-full ${s.is_result_published ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {s.is_result_published ? 'Published' : (s.grading_status || 'draft_review')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Submitted: {new Date(s.submitted_at).toLocaleString()}</p>
                      <p className="text-xs text-gray-600 mt-1">Current score: {Math.round((s.display_score ?? 0) * 10) / 10}%</p>

                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => loadSubmissionDetail(s.id)}
                          className="px-3 py-1.5 text-xs border rounded-md hover:bg-white"
                        >
                          <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> Review</span>
                        </button>
                        <button
                          onClick={async () => {
                            await loadSubmissionDetail(s.id);
                            await api.post(`/instructor/quizzes/submissions/${s.id}/publish`, {});
                            await loadSubmissions(selectedQuizId);
                            setSuccess('Attempt published.');
                          }}
                          className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                        >
                          <span className="inline-flex items-center gap-1"><Megaphone className="w-3 h-3" /> Publish This</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900">Review Panel</h3>
            {isLoadingDetail && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
          </div>

          {!detail && !isLoadingDetail && (
            <p className="text-sm text-gray-500 py-6 text-center">Select an attempt to start grading.</p>
          )}

          {detail && (
            <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1">
              <div className="p-3 rounded-lg bg-gray-50 border">
                <p className="text-sm text-gray-700"><strong>Quiz:</strong> {detail.quiz.title}</p>
                <p className="text-sm text-gray-700"><strong>Attempt:</strong> {detail.submission.id}</p>
                <p className="text-sm text-gray-700"><strong>Status:</strong> {detail.submission.is_result_published ? 'Published' : (detail.submission.grading_status || 'draft_review')}</p>
              </div>

              {detail.questions.map((q, idx) => {
                const studentAnswer = detail.submission.answers?.[q.id] || '';
                return (
                  <div key={q.id} className="border rounded-lg p-3">
                    <p className="text-sm font-semibold text-gray-900">Q{idx + 1}. {q.question_text}</p>
                    <p className="text-xs text-gray-500 mt-1">Type: {q.question_type} | Max: {q.points}</p>
                    <p className="text-sm mt-2"><strong>Student answer:</strong> {studentAnswer || 'No answer submitted'}</p>
                    <p className="text-sm mt-1 text-gray-700"><strong>Expected:</strong> {q.correct_answer}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                      <input
                        type="number"
                        min="0"
                        max={q.points}
                        step="0.5"
                        value={gradeDrafts[q.id]?.awarded_points || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setGradeDrafts((prev) => ({
                            ...prev,
                            [q.id]: {
                              ...(prev[q.id] || { comment: '' }),
                              awarded_points: value
                            }
                          }));
                        }}
                        className="px-3 py-2 border rounded-md text-sm"
                        placeholder="Points"
                      />
                      <input
                        type="text"
                        value={gradeDrafts[q.id]?.comment || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          setGradeDrafts((prev) => ({
                            ...prev,
                            [q.id]: {
                              ...(prev[q.id] || { awarded_points: '' }),
                              comment: value
                            }
                          }));
                        }}
                        className="sm:col-span-2 px-3 py-2 border rounded-md text-sm"
                        placeholder="Optional comment for this question"
                      />
                    </div>
                  </div>
                );
              })}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Overall feedback</label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="Optional summary feedback"
                />
              </div>

              <div className="p-3 rounded-lg border bg-gray-50 flex items-center justify-between">
                <p className="text-sm text-gray-800">
                  Total: <strong>{totalAwarded.toFixed(2)}</strong> / {totalPossible.toFixed(2)} points
                </p>
                <p className="text-sm text-gray-800">
                  Percent: <strong>{totalPossible > 0 ? ((totalAwarded / totalPossible) * 100).toFixed(2) : '0.00'}%</strong>
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pb-2">
                <button
                  onClick={handleSaveGrades}
                  disabled={isSavingGrade}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSavingGrade ? 'Saving...' : 'Save Grades'}
                </button>
                <button
                  onClick={handlePublishOne}
                  disabled={isPublishingOne}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isPublishingOne ? 'Publishing...' : 'Publish This Attempt'}
                </button>
                {detail.submission.is_result_published && (
                  <span className="inline-flex items-center gap-1 text-emerald-700 text-sm font-medium px-2 py-1">
                    <CheckCircle2 className="w-4 h-4" /> Published
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
