import React, { useState, useEffect, useCallback } from 'react';
import {
  Award,
  MessageSquare,
  Calendar,
  Clock,
  AlertCircle,
  Loader2,
  TrendingUp,
  BookOpen,
  User,
  Filter,
  Search,
} from 'lucide-react';
import { api } from '../../lib/api';

interface GradedAssignment {
  id: string;
  assignment_id: string;
  title: string;
  section_name: string;
  teacher_name: string;
  score: number;
  max_score: number;
  feedback: string;
  submission_date: string;
  graded_date: string;
  percentage: number;
}

interface GradeStats {
  total_graded: number;
  average_grade: number;
  highest_grade: number;
  lowest_grade: number;
}

interface FilterState {
  searchTerm: string;
  sortBy: 'recent' | 'grade' | 'course';
}

const GradeFeedback: React.FC = () => {
  const [assignments, setAssignments] = useState<GradedAssignment[]>([]);
  const [stats, setStats] = useState<GradeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState<GradedAssignment | null>(null);

  const [filter, setFilter] = useState<FilterState>({
    searchTerm: '',
    sortBy: 'recent',
  });

  const loadGrades = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get('/student/grades') as {
        assignments: GradedAssignment[];
        stats: GradeStats;
      };
      setAssignments(response.assignments || []);
      setStats(response.stats);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load grades');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGrades();
  }, [loadGrades]);

  // Filter and sort
  const filteredAssignments = assignments
    .filter(
      (a) =>
        a.title.toLowerCase().includes(filter.searchTerm.toLowerCase()) ||
        a.section_name.toLowerCase().includes(filter.searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (filter.sortBy) {
        case 'grade':
          return b.percentage - a.percentage;
        case 'course':
          return a.section_name.localeCompare(b.section_name);
        case 'recent':
        default:
          return new Date(b.graded_date).getTime() - new Date(a.graded_date).getTime();
      }
    });

  const getGradeColor = (percentage: number) => {
    if (percentage >= 85) return 'text-green-600 bg-green-50 border-green-200';
    if (percentage >= 80) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (percentage >= 75) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getLetterGrade = (percentage: number) => {
    if (percentage >= 85) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 75) return 'C';
    return 'F';
  };

  const getGradeBarColor = (percentage: number) => {
    if (percentage >= 85) return 'bg-green-600';
    if (percentage >= 80) return 'bg-blue-600';
    if (percentage >= 75) return 'bg-orange-600';
    return 'bg-red-600';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="p-3 bg-purple-100 rounded-lg flex-shrink-0">
              <Award className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Your Grades</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">View feedback and grades from instructors</p>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm sm:text-base text-red-700">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Graded</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.total_graded || 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-lg flex-shrink-0">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Average</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {stats?.average_grade.toFixed(1) || '0'}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 rounded-lg flex-shrink-0">
                    <Award className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Highest</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {stats?.highest_grade.toFixed(0) || '0'}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-100 rounded-lg flex-shrink-0">
                    <AlertCircle className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Lowest</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {stats?.lowest_grade.toFixed(0) || '0'}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6 mb-6 sm:mb-8">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={filter.searchTerm}
                      onChange={(e) => setFilter({ ...filter, searchTerm: e.target.value })}
                      placeholder="Search assignments..."
                      className="w-full pl-9 pr-3 sm:pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Sort By</label>
                  <select
                    value={filter.sortBy}
                    onChange={(e) => setFilter({ ...filter, sortBy: e.target.value as typeof filter.sortBy })}
                    className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="recent">Most Recent</option>
                    <option value="grade">Highest Grade</option>
                    <option value="course">Course Name</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Assignments List */}
            {filteredAssignments.length === 0 ? (
              <div className="bg-white rounded-lg sm:rounded-xl p-12 text-center">
                <Award className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 text-lg">No graded assignments yet</p>
                <p className="text-gray-500 text-sm mt-2">Your instructors will post grades here as they grade your work.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="bg-white rounded-lg sm:rounded-xl shadow hover:shadow-md transition-shadow"
                  >
                    <button
                      onClick={() =>
                        setSelectedAssignment(
                          selectedAssignment?.id === assignment.id ? null : assignment
                        )
                      }
                      className="w-full text-left p-4 sm:p-6 focus:outline-none"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm sm:text-base font-bold text-gray-900 break-words">
                            {assignment.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-gray-600 mt-2">
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3 h-3 flex-shrink-0" />
                              {assignment.section_name}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 flex-shrink-0" />
                              {assignment.teacher_name}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 sm:gap-6 w-full sm:w-auto">
                          <div>
                            <p className="text-xs text-gray-600">Score</p>
                            <p className="text-xl sm:text-2xl font-bold text-gray-900">
                              {assignment.score}/{assignment.max_score}
                            </p>
                          </div>

                          <div
                            className={`px-3 sm:px-4 py-2 rounded-lg border font-bold text-center flex-shrink-0 ${getGradeColor(
                              assignment.percentage
                            )}`}
                          >
                            <div className="text-lg sm:text-xl">{getLetterGrade(assignment.percentage)}</div>
                            <div className="text-xs">{assignment.percentage.toFixed(1)}%</div>
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-4 sm:mt-6">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600">Progress</span>
                          <span className="text-xs text-gray-500">
                            {assignment.score} / {assignment.max_score}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${getGradeBarColor(
                              assignment.percentage
                            )}`}
                            style={{ width: `${assignment.percentage}%` }}
                          />
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Submitted: {new Date(assignment.submission_date).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Graded: {new Date(assignment.graded_date).toLocaleDateString()}
                        </span>
                      </div>
                    </button>

                    {/* Feedback Section */}
                    {selectedAssignment?.id === assignment.id && assignment.feedback && (
                      <div className="border-t border-gray-200 p-4 sm:p-6 bg-gray-50">
                        <div className="flex items-start gap-3 mb-3">
                          <MessageSquare className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                          <h4 className="font-semibold text-gray-900">Instructor Feedback</h4>
                        </div>
                        <div className="prose prose-sm max-w-none text-gray-700 break-words whitespace-pre-wrap">
                          {assignment.feedback}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default GradeFeedback;
