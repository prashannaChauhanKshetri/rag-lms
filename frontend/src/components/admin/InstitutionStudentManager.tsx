import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Search,
  Filter,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Calendar,
  Edit2,
} from 'lucide-react';
import { api } from '../../lib/api';

interface Student {
  id: string;
  username: string;
  email: string;
  full_name: string;
  department?: string;
  enrollment_date: string;
  status: 'active' | 'inactive';
  total_assignments: number;
  completed_assignments: number;
  average_grade: number;
}

interface StudentFilter {
  searchTerm: string;
  department: string;
  status: 'all' | 'active' | 'inactive';
  sortBy: 'name' | 'grade' | 'enrollment';
}

const InstitutionStudentManager: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [filter, setFilter] = useState<StudentFilter>({
    searchTerm: '',
    department: 'all',
    status: 'all',
    sortBy: 'name',
  });



  const loadStudents = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/institution/students') as { students: Student[] };
      setStudents(response.students || []);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load students');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  // Apply filters and sorting
  useEffect(() => {
    let result = [...students];

    // Search filter
    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.full_name.toLowerCase().includes(term) ||
          s.email.toLowerCase().includes(term) ||
          s.username.toLowerCase().includes(term)
      );
    }

    // Department filter
    if (filter.department !== 'all') {
      result = result.filter((s) => s.department === filter.department);
    }

    // Status filter
    if (filter.status !== 'all') {
      result = result.filter((s) => s.status === filter.status);
    }

    // Sorting
    result.sort((a, b) => {
      switch (filter.sortBy) {
        case 'grade':
          return b.average_grade - a.average_grade;
        case 'enrollment':
          return new Date(b.enrollment_date).getTime() - new Date(a.enrollment_date).getTime();
        case 'name':
        default:
          return a.full_name.localeCompare(b.full_name);
      }
    });

    setFilteredStudents(result);
  }, [students, filter]);

  const handleRemoveStudent = async (studentId: string) => {
    if (!confirm('Remove this student from the institution?')) return;

    try {
      await api.delete(`/admin/institution/students/${studentId}`);
      setSuccess('Student removed successfully');
      await loadStudents();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to remove student');
    }
  };

  const getGradeColor = (grade: number): string => {
    if (grade >= 90) return 'text-green-600 bg-green-50';
    if (grade >= 80) return 'text-blue-600 bg-blue-50';
    if (grade >= 70) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const departments = Array.from(new Set(students.map((s) => s.department).filter(Boolean))) as string[];

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">Student Management</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Manage and monitor all enrolled students</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm sm:text-base">
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Add Student</span>
                <span className="sm:hidden">Add</span>
              </button>
              <button className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm sm:text-base font-medium">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
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
        {success && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-lg sm:rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm sm:text-base text-green-700">{success}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Total Students</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{students.length}</p>
              </div>
              <Users className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 opacity-10" />
            </div>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Active</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
                  {students.filter((s) => s.status === 'active').length}
                </p>
              </div>
              <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-green-500 opacity-10" />
            </div>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-600">Avg Grade</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
                  {(students.reduce((sum, s) => sum + s.average_grade, 0) / Math.max(students.length, 1)).toFixed(1)}%
                </p>
              </div>
              <Calendar className="w-10 h-10 sm:w-12 sm:h-12 text-purple-500 opacity-10" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6 mb-6 sm:mb-8">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={filter.searchTerm}
                  onChange={(e) => setFilter({ ...filter, searchTerm: e.target.value })}
                  placeholder="Name, email..."
                  className="w-full pl-9 pr-3 sm:pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Department</label>
              <select
                value={filter.department}
                onChange={(e) => setFilter({ ...filter, department: e.target.value })}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={filter.status}
                onChange={(e) => setFilter({ ...filter, status: e.target.value as typeof filter.status })}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Sort By</label>
              <select
                value={filter.sortBy}
                onChange={(e) => setFilter({ ...filter, sortBy: e.target.value as typeof filter.sortBy })}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="name">Name (A-Z)</option>
                <option value="grade">Grade (High-Low)</option>
                <option value="enrollment">Recent First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Students Table/Cards */}
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-lg sm:rounded-xl shadow overflow-hidden">
              {filteredStudents.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No students found</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Student</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Department</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Progress</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Grade</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{student.full_name}</div>
                          <div className="text-xs text-gray-500">{student.username}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{student.email}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{student.department || '-'}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="text-xs text-gray-600">
                            {student.completed_assignments}/{student.total_assignments}
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{
                                width: `${(student.completed_assignments / Math.max(student.total_assignments, 1)) * 100}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td className={`px-6 py-4 text-center text-sm font-semibold ${getGradeColor(student.average_grade)}`}>
                          {student.average_grade.toFixed(1)}%
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              student.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {student.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              // Edit functionality placeholder
                            }}
                            className="text-blue-600 hover:text-blue-800 mr-3"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveStudent(student.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-lg">
                  <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-gray-600">No students found</p>
                </div>
              ) : (
                filteredStudents.map((student) => (
                  <div key={student.id} className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{student.full_name}</h3>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{student.email}</p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                          student.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {student.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="text-xs">
                        <span className="text-gray-600">Progress:</span>
                        <div className="flex items-center gap-1 mt-1">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full"
                              style={{
                                width: `${(student.completed_assignments / Math.max(student.total_assignments, 1)) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="font-medium text-gray-900">
                            {student.completed_assignments}/{student.total_assignments}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-600">Grade:</span>
                        <div className={`font-semibold mt-1 ${getGradeColor(student.average_grade)}`}>
                          {student.average_grade.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // View/edit functionality placeholder
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-2 border border-blue-300 text-blue-600 text-xs font-medium rounded-lg hover:bg-blue-50"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        View
                      </button>
                      <button
                        onClick={() => handleRemoveStudent(student.id)}
                        className="flex-1 flex items-center justify-center gap-1 py-2 border border-red-300 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InstitutionStudentManager;
