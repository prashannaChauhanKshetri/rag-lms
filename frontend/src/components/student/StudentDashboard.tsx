import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  Upload,
  Calendar,
  Loader2,
  Search,
  TrendingUp,
  Award,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';

interface Section {
  id: string;
  name: string;
  teacher_name: string;
  student_count: number;
  assignment_count: number;
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string;
  status: 'pending' | 'submitted' | 'graded';
  section_name: string;
  score?: number;
  feedback?: string;
}

interface StudentStats {
  total_enrollments: number;
  active_assignments: number;
  completed_assignments: number;
  overall_grade: number;
}

type TabType = 'overview' | 'assignments' | 'courses' | 'progress';

const StudentDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<StudentStats | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      // Load sections
      const sectionsResponse = await api.get('/student/sections') as { sections: Section[] };
      setSections(sectionsResponse.sections || []);

      // Load assignments
      const assignmentsResponse = await api.get('/student/assignments') as { assignments: Assignment[] };
      setAssignments(assignmentsResponse.assignments || []);

      // Load stats
      const statsResponse = await api.get('/student/stats') as StudentStats;
      setStats(statsResponse);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const filteredAssignments = assignments.filter(
    (a) => a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
           a.section_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingAssignments = assignments.filter((a) => a.status === 'pending');
  const completedAssignments = assignments.filter((a) => a.status === 'graded');

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">My Courses</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Track your assignments and progress</p>
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

        {/* Tab Navigation */}
        <div className="mb-6 sm:mb-8 border-b border-gray-200">
          <div className="flex gap-4 sm:gap-8 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 sm:pb-4 px-1 font-medium text-sm sm:text-base transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <TrendingUp className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Overview</span>
              <span className="sm:hidden">Stats</span>
            </button>
            <button
              onClick={() => setActiveTab('assignments')}
              className={`pb-3 sm:pb-4 px-1 font-medium text-sm sm:text-base transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'assignments'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <FileText className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              Assignments
              {pendingAssignments.length > 0 && (
                <span className="ml-1 sm:ml-2 inline-block px-2 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">
                  {pendingAssignments.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('courses')}
              className={`pb-3 sm:pb-4 px-1 font-medium text-sm sm:text-base transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'courses'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <BookOpen className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              Courses
            </button>
            <button
              onClick={() => setActiveTab('progress')}
              className={`pb-3 sm:pb-4 px-1 font-medium text-sm sm:text-base transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'progress'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <Award className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              Progress
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div>
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Enrolled Courses</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{stats?.total_enrollments || 0}</p>
                      </div>
                      <BookOpen className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 opacity-10" />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Active Assignments</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{stats?.active_assignments || 0}</p>
                      </div>
                      <Clock className="w-10 h-10 sm:w-12 sm:h-12 text-orange-500 opacity-10" />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Completed</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{stats?.completed_assignments || 0}</p>
                      </div>
                      <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-green-500 opacity-10" />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Overall Grade</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{stats?.overall_grade || 0}%</p>
                      </div>
                      <Award className="w-10 h-10 sm:w-12 sm:h-12 text-purple-500 opacity-10" />
                    </div>
                  </div>
                </div>

                {/* Pending Assignments */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Pending Assignments</h3>
                    {pendingAssignments.length === 0 ? (
                      <p className="text-sm text-gray-500">No pending assignments</p>
                    ) : (
                      <div className="space-y-3">
                        {pendingAssignments.slice(0, 5).map((assignment) => (
                          <div key={assignment.id} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{assignment.title}</p>
                                <p className="text-xs text-gray-600 mt-0.5">{assignment.section_name}</p>
                              </div>
                              <Clock className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                            </div>
                            <p className="text-xs text-orange-700 mt-2 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Due: {new Date(assignment.due_date).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Latest Grades</h3>
                    {completedAssignments.length === 0 ? (
                      <p className="text-sm text-gray-500">No graded assignments yet</p>
                    ) : (
                      <div className="space-y-3">
                        {completedAssignments.slice(0, 5).map((assignment) => (
                          <div key={assignment.id} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{assignment.title}</p>
                                <p className="text-xs text-gray-600 mt-0.5">{assignment.section_name}</p>
                              </div>
                              <span className="px-3 py-1 text-xs font-bold bg-green-200 text-green-800 rounded-full flex-shrink-0">
                                {assignment.score}%
                              </span>
                            </div>
                            {assignment.feedback && (
                              <p className="text-xs text-gray-700 mt-2 line-clamp-2">Feedback: {assignment.feedback}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Assignments Tab */}
            {activeTab === 'assignments' && (
              <div>
                {/* Search */}
                <div className="mb-4 sm:mb-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search assignments..."
                      className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Assignments List */}
                <div className="space-y-3 sm:space-y-4">
                  {filteredAssignments.length === 0 ? (
                    <div className="p-8 text-center bg-white rounded-lg">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-600">No assignments found</p>
                    </div>
                  ) : (
                    filteredAssignments.map((assignment) => (
                      <div key={assignment.id} className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6 hover:shadow-md transition-shadow">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm sm:text-lg font-bold text-gray-900 truncate">{assignment.title}</h3>
                            <p className="text-xs sm:text-sm text-gray-600 mt-1">{assignment.section_name}</p>
                          </div>
                          <span className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-full flex-shrink-0 ${
                            assignment.status === 'pending'
                              ? 'bg-orange-100 text-orange-800'
                              : assignment.status === 'submitted'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {assignment.status === 'pending' ? 'Pending' : assignment.status === 'submitted' ? 'Submitted' : 'Graded'}
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 line-clamp-2">{assignment.description}</p>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                          <div className="flex items-center gap-4 text-xs sm:text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(assignment.due_date).toLocaleDateString()}
                            </span>
                            {assignment.score !== undefined && (
                              <span className="flex items-center gap-1 font-semibold text-green-600">
                                <CheckCircle2 className="w-4 h-4" />
                                Score: {assignment.score}%
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 w-full sm:w-auto">
                            {assignment.status === 'pending' && (
                              <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base font-medium">
                                <Upload className="w-4 h-4" />
                                <span className="hidden sm:inline">Submit</span>
                              </button>
                            )}
                            {assignment.status === 'graded' && assignment.feedback && (
                              <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base font-medium">
                                <Download className="w-4 h-4" />
                                <span className="hidden sm:inline">View Feedback</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Courses Tab */}
            {activeTab === 'courses' && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {sections.length === 0 ? (
                    <div className="col-span-1 sm:col-span-2 lg:col-span-3 p-8 text-center bg-white rounded-lg">
                      <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-600">No enrolled courses yet</p>
                    </div>
                  ) : (
                    sections.map((section) => (
                      <div key={section.id} className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6 hover:shadow-lg transition-shadow">
                        <div className="flex items-start justify-between mb-3 sm:mb-4">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                          </div>
                        </div>
                        <h3 className="text-sm sm:text-lg font-bold text-gray-900 mb-1 line-clamp-2">{section.name}</h3>
                        <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">Taught by {section.teacher_name}</p>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {section.student_count} students
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            {section.assignment_count} assignments
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Progress Tab */}
            {activeTab === 'progress' && (
              <div>
                <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-6">Your Progress</h2>
                  
                  {/* Grade Distribution */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
                    <div className="p-4 sm:p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-lg sm:rounded-xl border border-green-200">
                      <p className="text-xs sm:text-sm text-green-700 font-medium">Excellent</p>
                      <p className="text-2xl sm:text-3xl font-bold text-green-900 mt-2">
                        {assignments.filter((a) => a.score && a.score >= 90).length}
                      </p>
                    </div>
                    <div className="p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg sm:rounded-xl border border-blue-200">
                      <p className="text-xs sm:text-sm text-blue-700 font-medium">Good</p>
                      <p className="text-2xl sm:text-3xl font-bold text-blue-900 mt-2">
                        {assignments.filter((a) => a.score && a.score >= 70 && a.score < 90).length}
                      </p>
                    </div>
                    <div className="p-4 sm:p-6 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg sm:rounded-xl border border-amber-200">
                      <p className="text-xs sm:text-sm text-amber-700 font-medium">Needs Work</p>
                      <p className="text-2xl sm:text-3xl font-bold text-amber-900 mt-2">
                        {assignments.filter((a) => a.score && a.score < 70).length}
                      </p>
                    </div>
                  </div>

                  {/* Tips */}
                  <div className="p-4 sm:p-6 bg-blue-50 rounded-lg sm:rounded-xl border border-blue-200">
                    <p className="text-sm font-semibold text-blue-900 mb-3">Tips to Improve</p>
                    <ul className="text-xs sm:text-sm text-blue-800 space-y-2">
                      <li>• Start assignments early to avoid last-minute rush</li>
                      <li>• Review feedback from previous assignments</li>
                      <li>• Attend all classes and take good notes</li>
                      <li>• Ask for help if you're struggling</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;
