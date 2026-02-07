import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Target,
  Award,
  AlertCircle,
  Loader2,
  BookOpen,
  Clock,
  Zap,
} from 'lucide-react';
import { api } from '../../lib/api';

interface CourseProgress {
  course_id: string;
  course_name: string;
  total_assignments: number;
  completed_assignments: number;
  average_grade: number;
  completion_percentage: number;
  last_activity: string;
}

interface ProgressStats {
  overall_completion: number;
  overall_average_grade: number;
  total_courses: number;
  total_assignments: number;
  completed_assignments: number;
  courses: CourseProgress[];
}

interface TimeframeData {
  week: number;
  assignments_completed: number;
  average_grade: number;
}

const ProgressTracker: React.FC = () => {
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [timeframeData, setTimeframeData] = useState<TimeframeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'semester'>('month');

  const loadProgress = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const statsResponse = await api.get('/student/progress') as ProgressStats;
      setStats(statsResponse);

      const timeframeResponse = await api.get(`/student/progress/timeline?timeframe=${timeframe}`) as {
        data: TimeframeData[];
      };
      setTimeframeData(timeframeResponse.data || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load progress data');
    } finally {
      setIsLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const getProgressColor = (percentage: number) => {
    if (percentage >= 85) return 'bg-green-500';
    if (percentage >= 70) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getGradeColor = (grade: number) => {
    if (grade >= 85) return 'text-green-600 bg-green-50';
    if (grade >= 75) return 'text-blue-600 bg-blue-50';
    if (grade >= 65) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const getAdaptiveMessage = (percentage: number, grade: number) => {
    if (percentage >= 80 && grade >= 80) {
      return '🎯 Excellent progress! Keep up the great work!';
    } else if (percentage >= 60 && grade >= 70) {
      return '📈 You\'re on track! Continue submitting assignments.';
    } else if (percentage >= 40) {
      return '⚡ You have pending assignments. Try to catch up!';
    } else {
      return '🚨 Several assignments need attention. Start working on them!';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="p-3 bg-green-100 rounded-lg flex-shrink-0">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Your Progress</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Track your learning journey and course completion</p>
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
            {/* Overall Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg flex-shrink-0">
                    <BookOpen className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Total Courses</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.total_courses || 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-lg flex-shrink-0">
                    <Target className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Completion</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {stats?.overall_completion.toFixed(0)}%
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
                    <p className="text-xs sm:text-sm text-gray-600">Average Grade</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {stats?.overall_average_grade.toFixed(1) || '0'}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-100 rounded-lg flex-shrink-0">
                    <Zap className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600">Submitted</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {stats?.completed_assignments}/{stats?.total_assignments}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Adaptive Message */}
            {stats && (
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg sm:rounded-xl p-4 sm:p-6 mb-6 sm:mb-8">
                <p className="text-base sm:text-lg font-medium text-blue-900">
                  {getAdaptiveMessage(stats.overall_completion, stats.overall_average_grade)}
                </p>
              </div>
            )}

            {/* Timeline Chart */}
            <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6 mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Performance Timeline
                </h2>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
                  className="w-full sm:w-auto px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="semester">This Semester</option>
                </select>
              </div>

              {timeframeData.length === 0 ? (
                <div className="text-center py-12 text-gray-600">
                  No data available for this timeframe
                </div>
              ) : (
                <div className="space-y-4">
                  {timeframeData.map((point, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="w-20 sm:w-24 text-sm font-medium text-gray-600">
                        <span className="hidden sm:inline">Week {point.week}</span>
                        <span className="sm:hidden">W{point.week}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                          <span className="text-sm text-gray-600">
                            {point.assignments_completed} assignment{point.assignments_completed !== 1 ? 's' : ''} completed
                          </span>
                          <span className={`text-sm font-medium px-2 py-1 rounded ${getGradeColor(point.average_grade)}`}>
                            {point.average_grade.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${getProgressColor(point.average_grade)}`}
                            style={{ width: `${Math.min(point.average_grade, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Course Breakdown */}
            <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Course Breakdown
              </h2>

              {!stats || stats.courses.length === 0 ? (
                <div className="text-center py-12 text-gray-600">
                  No courses enrolled yet
                </div>
              ) : (
                <div className="space-y-6">
                  {stats.courses.map((course) => (
                    <div
                      key={course.course_id}
                      className="border border-gray-200 rounded-lg p-4 sm:p-6 hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                        <div>
                          <h3 className="font-bold text-gray-900 text-base sm:text-lg break-words">
                            {course.course_name}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">
                            {course.completed_assignments} of {course.total_assignments} assignments completed
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div
                            className={`px-3 sm:px-4 py-2 rounded-lg border font-bold text-center flex-shrink-0 ${getGradeColor(
                              course.average_grade
                            )}`}
                          >
                            <div className="text-lg sm:text-xl">{course.average_grade.toFixed(1)}%</div>
                          </div>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs sm:text-sm font-medium text-gray-600">Overall Progress</span>
                          <span className="text-xs sm:text-sm font-bold text-gray-900">
                            {course.completion_percentage.toFixed(0)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-3 rounded-full transition-all ${getProgressColor(
                              course.completion_percentage
                            )}`}
                            style={{ width: `${course.completion_percentage}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>Last activity: {new Date(course.last_activity).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProgressTracker;
