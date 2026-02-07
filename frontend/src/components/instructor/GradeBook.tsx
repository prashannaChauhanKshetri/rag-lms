import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Download,
  TrendingUp,
  Filter,
  Search,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Edit2,
  Save,
  X,
  Award,
  Target,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';

interface GradeEntry {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  assignment_id: string;
  assignment_title: string;
  score: number;
  max_score: number;
  feedback: string;
  submission_date: string;
  graded_date: string;
}

interface StudentGrades {
  student_id: string;
  student_name: string;
  student_email: string;
  total_score: number;
  max_score: number;
  percentage: number;
  grade_letter: string;
  assignments_graded: number;
  total_assignments: number;
}

interface GradeFilter {
  searchTerm: string;
  sortBy: 'name' | 'grade' | 'average';
  assignmentId: 'all' | string;
}

const GradeBook: React.FC = () => {
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [studentGrades, setStudentGrades] = useState<StudentGrades[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [view, setView] = useState<'summary' | 'detailed'>('summary');
  const [filter, setFilter] = useState<GradeFilter>({
    searchTerm: '',
    sortBy: 'name',
    assignmentId: 'all',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScore, setEditScore] = useState('');
  const [editFeedback, setEditFeedback] = useState('');

  const loadGrades = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get('/instructor/grades') as {
        grades: GradeEntry[];
        student_summary: StudentGrades[];
      };
      setGrades(response.grades || []);
      setStudentGrades(response.student_summary || []);
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

  // Filtered and sorted student grades
  const filteredStudentGrades = useMemo(() => {
    let result = [...studentGrades];

    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.student_name.toLowerCase().includes(term) ||
          s.student_email.toLowerCase().includes(term)
      );
    }

    result.sort((a, b) => {
      switch (filter.sortBy) {
        case 'grade':
          return b.percentage - a.percentage;
        case 'average':
          return b.total_score / b.max_score - a.total_score / a.max_score;
        case 'name':
        default:
          return a.student_name.localeCompare(b.student_name);
      }
    });

    return result;
  }, [studentGrades, filter]);

  // Filtered grade entries
  const filteredGrades = useMemo(() => {
    let result = [...grades];

    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase();
      result = result.filter(
        (g) =>
          g.student_name.toLowerCase().includes(term) ||
          g.student_email.toLowerCase().includes(term) ||
          g.assignment_title.toLowerCase().includes(term)
      );
    }

    if (filter.assignmentId !== 'all') {
      result = result.filter((g) => g.assignment_id === filter.assignmentId);
    }

    result.sort((a, b) => {
      switch (filter.sortBy) {
        case 'grade':
          return (b.score / b.max_score) - (a.score / a.max_score);
        case 'average':
          return b.score - a.score;
        case 'name':
        default:
          return a.student_name.localeCompare(b.student_name);
      }
    });

    return result;
  }, [grades, filter]);

  const handleUpdateGrade = async (gradeId: string) => {
    try {
      const score = parseFloat(editScore);
      const grade = grades.find((g) => g.id === gradeId);

      if (!grade || score > grade.max_score || score < 0) {
        setError('Invalid score');
        return;
      }

      await api.put(`/instructor/grades/${gradeId}`, {
        score,
        feedback: editFeedback,
      });

      setSuccess('Grade updated successfully');
      setEditingId(null);
      await loadGrades();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to update grade');
    }
  };

  const getGradeColor = (percentage: number) => {
    if (percentage >= 85) return 'bg-green-100 text-green-800 border-green-300';
    if (percentage >= 80) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (percentage >= 75) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  const getLetterGrade = (percentage: number) => {
    if (percentage >= 85) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 75) return 'C';
    return 'F';
  };

  const stats = {
    averageGrade: studentGrades.length > 0
      ? (studentGrades.reduce((sum, s) => sum + s.percentage, 0) / studentGrades.length).toFixed(1)
      : 0,
    highestGrade: studentGrades.length > 0
      ? Math.max(...studentGrades.map((s) => s.percentage))
      : 0,
    lowestGrade: studentGrades.length > 0
      ? Math.min(...studentGrades.map((s) => s.percentage))
      : 0,
  };

  const downloadGradebook = () => {
    let csv = 'Student Name,Email,Total Score,Max Score,Percentage,Grade\n';
    studentGrades.forEach((sg) => {
      csv += `"${sg.student_name}","${sg.student_email}",${sg.total_score},${sg.max_score},${sg.percentage.toFixed(1)},${getLetterGrade(sg.percentage)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gradebook_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">Grade Book</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Track and manage all student grades</p>
            </div>
            <button
              onClick={downloadGradebook}
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base font-medium"
            >
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Export CSV</span>
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
        {success && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-lg sm:rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm sm:text-base text-green-700">{success}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Students</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">{studentGrades.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Class Average</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.averageGrade}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Award className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Highest</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.highestGrade.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Target className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Lowest</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.lowestGrade.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* View Toggle and Filters */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 mb-6">
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => setView('summary')}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg font-medium text-sm transition-colors ${
                  view === 'summary'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setView('detailed')}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg font-medium text-sm transition-colors ${
                  view === 'detailed'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                Detailed
              </button>
            </div>
          </div>

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
                  placeholder="Search student..."
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
                <option value="name">Name (A-Z)</option>
                <option value="grade">Highest Grade First</option>
                <option value="average">Average Score</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : view === 'summary' ? (
          // Summary View
          <div className="space-y-3">
            {filteredStudentGrades.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-lg">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600">No students found</p>
              </div>
            ) : (
              filteredStudentGrades.map((student) => (
                <div
                  key={student.student_id}
                  className="bg-white rounded-lg p-4 sm:p-6 border border-gray-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-bold text-gray-900">{student.student_name}</h3>
                      <p className="text-xs sm:text-sm text-gray-600">{student.student_email}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {student.assignments_graded} of {student.total_assignments} assignments graded
                      </p>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto">
                      <div>
                        <div className="text-right">
                          <div className="text-xs sm:text-sm text-gray-600">Progress</div>
                          <div className="w-24 sm:w-32 bg-gray-200 rounded-full h-2 mt-1">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{
                                width: `${(student.assignments_graded / student.total_assignments) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div
                        className={`px-3 sm:px-4 py-2 rounded-lg border text-center flex-shrink-0 ${getGradeColor(
                          student.percentage
                        )}`}
                      >
                        <div className="text-2xl sm:text-3xl font-bold">{getLetterGrade(student.percentage)}</div>
                        <div className="text-xs sm:text-sm">{student.percentage.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          // Detailed View
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-900">
                      Student
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-900">
                      Assignment
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-900">
                      Score
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-900">
                      Grade
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold text-gray-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredGrades.map((grade) => (
                    <tr key={grade.id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-4 text-xs sm:text-sm">
                        <div>
                          <p className="font-medium text-gray-900">{grade.student_name}</p>
                          <p className="text-gray-600">{grade.student_email}</p>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-xs sm:text-sm text-gray-900">
                        {grade.assignment_title}
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-xs sm:text-sm">
                        {editingId === grade.id ? (
                          <input
                            type="number"
                            value={editScore}
                            onChange={(e) => setEditScore(e.target.value)}
                            max={grade.max_score}
                            min="0"
                            className="w-20 px-2 py-1 border border-blue-500 rounded text-sm"
                            autoFocus
                          />
                        ) : (
                          <span className="font-medium text-gray-900">
                            {grade.score} / {grade.max_score}
                          </span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-xs sm:text-sm">
                        <span className={`px-2 sm:px-3 py-1 rounded-full ${getGradeColor(
                          (grade.score / grade.max_score) * 100
                        )}`}>
                          {getLetterGrade((grade.score / grade.max_score) * 100)}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-xs sm:text-sm">
                        {editingId === grade.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateGrade(grade.id)}
                              className="p-1 text-green-600 hover:text-green-800"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 text-gray-600 hover:text-gray-800"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingId(grade.id);
                              setEditScore(grade.score.toString());
                              setEditFeedback(grade.feedback);
                            }}
                            className="p-1 text-blue-600 hover:text-blue-800"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GradeBook;
