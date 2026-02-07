import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  FileText,
  CheckCircle2,
  AlertCircle,
  Filter,
  Download,
  Loader2,
} from 'lucide-react';
import { api } from '../../lib/api';

interface AssignmentStats {
  id: string;
  title: string;
  total_students: number;
  submissions: number;
  graded: number;
  pending: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  on_time: number;
  late: number;
  not_submitted: number;
}

interface FilterOptions {
  sortBy: 'title' | 'submissions' | 'average' | 'pending';
  timeFrame: 'all' | 'week' | 'month';
}

const AssignmentAnalytics: React.FC = () => {
  const [assignments, setAssignments] = useState<AssignmentStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState<FilterOptions>({
    sortBy: 'submissions',
    timeFrame: 'all',
  });

  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentStats | null>(null);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get(
        `/instructor/assignments/analytics?timeframe=${filter.timeFrame}`
      ) as { assignments: AssignmentStats[] };
      setAssignments(response.assignments || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [filter.timeFrame]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Sort assignments
  const sortedAssignments = React.useMemo(() => {
    const sorted = [...assignments];

    switch (filter.sortBy) {
      case 'submissions':
        sorted.sort((a, b) => b.submissions - a.submissions);
        break;
      case 'average':
        sorted.sort((a, b) => b.average_score - a.average_score);
        break;
      case 'pending':
        sorted.sort((a, b) => b.pending - a.pending);
        break;
      case 'title':
      default:
        sorted.sort((a, b) => a.title.localeCompare(b.title));
    }

    return sorted;
  }, [assignments, filter.sortBy]);

  // Calculate totals
  const totals = React.useMemo(() => {
    return {
      total_assignments: assignments.length,
      total_students: assignments.reduce((sum, a) => Math.max(sum, a.total_students), 0),
      avg_submission_rate:
        assignments.length > 0
          ? (
              (assignments.reduce((sum, a) => sum + a.submissions, 0) /
                (assignments.reduce((sum, a) => sum + a.total_students, 0) || 1)) *
              100
            ).toFixed(1)
          : '0',
      avg_score:
        assignments.length > 0
          ? (assignments.reduce((sum, a) => sum + a.average_score, 0) / assignments.length).toFixed(1)
          : '0',
    };
  }, [assignments]);

  const downloadReport = () => {
    const csv = [
      ['Assignment', 'Total Students', 'Submitted', 'Graded', 'Avg Score', 'On Time', 'Late', 'Not Submitted'],
      ...sortedAssignments.map((a) => [
        a.title,
        a.total_students,
        a.submissions,
        a.graded,
        a.average_score.toFixed(1),
        a.on_time,
        a.late,
        a.not_submitted,
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assignment_analytics_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getScoreColor = (score: number): string => {
    if (score >= 85) return 'text-green-600 bg-green-50';
    if (score >= 75) return 'text-blue-600 bg-blue-50';
    if (score >= 65) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const getSubmissionRate = (assignment: AssignmentStats): number => {
    return (assignment.submissions / Math.max(assignment.total_students, 1)) * 100;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">Assignment Analytics</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Monitor submission rates, grades, and student progress</p>
            </div>
            <button
              onClick={downloadReport}
              className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base font-medium"
            >
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Export Report</span>
              <span className="sm:hidden">Export</span>
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm sm:text-base text-red-700">{error}</p>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Total Assignments</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{totals.total_assignments}</p>
              </div>
              <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 opacity-10" />
            </div>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Avg Submission Rate</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{totals.avg_submission_rate}%</p>
              </div>
              <TrendingUp className="w-10 h-10 sm:w-12 sm:h-12 text-green-500 opacity-10" />
            </div>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Average Grade</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{totals.avg_score}%</p>
              </div>
              <BarChart3 className="w-10 h-10 sm:w-12 sm:h-12 text-purple-500 opacity-10" />
            </div>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Students</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{totals.total_students}</p>
              </div>
              <Users className="w-10 h-10 sm:w-12 sm:h-12 text-orange-500 opacity-10" />
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
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Sort By</label>
              <select
                value={filter.sortBy}
                onChange={(e) => setFilter({ ...filter, sortBy: e.target.value as typeof filter.sortBy })}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="title">Title (A-Z)</option>
                <option value="submissions">Submissions</option>
                <option value="average">Average Grade</option>
                <option value="pending">Pending Grades</option>
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Time Frame</label>
              <select
                value={filter.timeFrame}
                onChange={(e) => setFilter({ ...filter, timeFrame: e.target.value as typeof filter.timeFrame })}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Time</option>
                <option value="month">This Month</option>
                <option value="week">This Week</option>
              </select>
            </div>
          </div>
        </div>

        {/* Assignments Table/Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Desktop View */}
            <div className="hidden md:block bg-white rounded-lg sm:rounded-xl shadow overflow-hidden">
              {sortedAssignments.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No assignments found</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Assignment</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Submissions</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Submit Rate</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Avg Grade</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">On Time / Late</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedAssignments.map((assignment) => (
                      <tr key={assignment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900 max-w-xs truncate">{assignment.title}</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="text-sm font-medium text-gray-900">
                            {assignment.submissions}/{assignment.total_students}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Pending: {assignment.pending}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${getSubmissionRate(assignment)}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-600 mt-2">
                            {getSubmissionRate(assignment).toFixed(0)}%
                          </div>
                        </td>
                        <td className={`px-6 py-4 text-center text-sm font-semibold ${getScoreColor(assignment.average_score)}`}>
                          {assignment.average_score.toFixed(1)}%
                        </td>
                        <td className="px-6 py-4 text-center text-sm">
                          <div className="font-medium text-green-600">{assignment.on_time}</div>
                          <div className="text-xs text-orange-600">{assignment.late} late</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setSelectedAssignment(assignment)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-3">
              {sortedAssignments.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-lg">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-gray-600">No assignments found</p>
                </div>
              ) : (
                sortedAssignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    onClick={() => setSelectedAssignment(assignment)}
                    className="bg-white rounded-lg p-4 border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 truncate">{assignment.title}</h3>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-600">Submissions</span>
                        <span className="font-semibold text-gray-900">
                          {assignment.submissions}/{assignment.total_students}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${getSubmissionRate(assignment)}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2 bg-blue-50 rounded">
                          <p className="text-gray-600">Avg Grade</p>
                          <p className={`font-semibold ${getScoreColor(assignment.average_score)}`}>
                            {assignment.average_score.toFixed(1)}%
                          </p>
                        </div>
                        <div className="p-2 bg-purple-50 rounded">
                          <p className="text-gray-600">Pending</p>
                          <p className="font-semibold text-purple-900">{assignment.pending}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-xs text-gray-600">
                          {assignment.on_time} on time, {assignment.late} late
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Detail Modal */}
        {selectedAssignment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedAssignment(null)}>
            <div
              className="bg-white rounded-lg sm:rounded-xl shadow-lg max-w-lg w-full max-h-96 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">{selectedAssignment.title}</h2>
                  <button
                    onClick={() => setSelectedAssignment(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-700">Submissions</p>
                      <p className="text-2xl font-bold text-blue-900 mt-1">
                        {selectedAssignment.submissions}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">of {selectedAssignment.total_students}</p>
                    </div>

                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-700">Graded</p>
                      <p className="text-2xl font-bold text-green-900 mt-1">
                        {selectedAssignment.graded}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        {((selectedAssignment.graded / selectedAssignment.submissions) * 100).toFixed(0)}%
                      </p>
                    </div>

                    <div className="p-4 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-700">Avg Score</p>
                      <p className="text-2xl font-bold text-purple-900 mt-1">
                        {selectedAssignment.average_score.toFixed(1)}%
                      </p>
                      <p className="text-xs text-purple-600 mt-1">Range: {selectedAssignment.lowest_score.toFixed(0)}-{selectedAssignment.highest_score.toFixed(0)}</p>
                    </div>

                    <div className="p-4 bg-orange-50 rounded-lg">
                      <p className="text-xs text-orange-700">Pending</p>
                      <p className="text-2xl font-bold text-orange-900 mt-1">
                        {selectedAssignment.pending}
                      </p>
                      <p className="text-xs text-orange-600 mt-1">to be graded</p>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-900 mb-3">Submission Status</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">On Time</span>
                        <span className="font-semibold text-green-600">{selectedAssignment.on_time}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Late</span>
                        <span className="font-semibold text-orange-600">{selectedAssignment.late}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Not Submitted</span>
                        <span className="font-semibold text-red-600">{selectedAssignment.not_submitted}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedAssignment(null)}
                  className="mt-6 w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssignmentAnalytics;
