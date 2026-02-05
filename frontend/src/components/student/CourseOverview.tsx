import { useState, useEffect } from 'react';
import { BookOpen, Users, CheckCircle, Calendar, Download, Upload } from 'lucide-react';

interface Section {
  id: string;
  name: string;
  chatbot_id: string;
  teacher_name: string;
  created_at: string;
  student_count: number;
}

interface Attendance {
  total: number;
  present: number;
  percentage: number;
}

interface Assignment {
  id: string;
  title: string;
  due_date?: string;
  points: number;
  is_published: boolean;
  submitted?: boolean;
  score?: number;
}

interface Resource {
  id: string;
  title: string;
  resource_type: string;
  url?: string;
  file_path?: string;
}

export default function CourseOverview() {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'resources' | 'attendance'>('overview');

  // Fetch enrolled sections
  useEffect(() => {
    const fetchSections = async () => {
      try {
        const res = await fetch('/student/sections', {
          credentials: 'include'
        });
        const data = await res.json();
        setSections(data.sections || []);
        if (data.sections && data.sections.length > 0) {
          setSelectedSection(data.sections[0]);
        }
      } catch (error) {
        console.error('Failed to fetch sections:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSections();
  }, []);

  // Fetch section data when selection changes
  useEffect(() => {
    if (!selectedSection) return;

    const fetchSectionData = async () => {
      try {
        const res = await fetch(`/student/sections/${selectedSection.id}`, {
          credentials: 'include'
        });
        const data = await res.json();
        setAssignments(data.assignments || []);
        setResources(data.resources || []);
        setAttendance(data.attendance || null);
      } catch (error) {
        console.error('Failed to fetch section data:', error);
      }
    };

    fetchSectionData();
  }, [selectedSection]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-slate-600">Loading your courses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-800">My Courses</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Course List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm sticky top-20">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white">
                <p className="text-sm font-medium opacity-90">Enrolled Courses</p>
                <p className="text-2xl font-bold">{sections.length}</p>
              </div>

              <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
                {sections.length === 0 ? (
                  <p className="p-4 text-slate-500 text-sm text-center">Not enrolled in any courses</p>
                ) : (
                  sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setSelectedSection(section)}
                      className={`w-full text-left p-4 transition-colors ${
                        selectedSection?.id === section.id
                          ? 'bg-blue-50 border-l-4 border-l-blue-600'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <p className="font-semibold text-slate-800 text-sm mb-1 truncate">{section.name}</p>
                      <p className="text-xs text-slate-500">by {section.teacher_name}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {selectedSection ? (
              <>
                {/* Course Header */}
                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">{selectedSection.name}</h2>
                  <p className="text-slate-600 mb-4">Instructor: {selectedSection.teacher_name}</p>

                  {attendance && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg">
                      <div>
                        <p className="text-xs text-slate-600 font-medium">Classes</p>
                        <p className="text-2xl font-bold text-slate-800">{attendance.total}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 font-medium">Present</p>
                        <p className="text-2xl font-bold text-green-600">{attendance.present}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 font-medium">Attendance</p>
                        <p className="text-2xl font-bold text-blue-600">{attendance.percentage}%</p>
                      </div>
                      <div className="hidden sm:block">
                        <p className="text-xs text-slate-600 font-medium">Status</p>
                        <p className={`text-sm font-bold ${attendance.percentage >= 75 ? 'text-green-600' : 'text-orange-600'}`}>
                          {attendance.percentage >= 75 ? '✓ Good' : '⚠ Low'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-white rounded-t-lg p-4 sm:p-6">
                  {(['overview', 'assignments', 'resources', 'attendance'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
                        activeTab === tab
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="bg-white rounded-b-lg border border-t-0 border-slate-200 p-4 sm:p-6 space-y-4">
                  {activeTab === 'overview' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-5 h-5 text-blue-600" />
                            <p className="font-semibold text-slate-800">Assignments</p>
                          </div>
                          <p className="text-3xl font-bold text-blue-600 mb-1">{assignments.filter(a => a.is_published).length}</p>
                          <p className="text-sm text-slate-600">{assignments.filter(a => a.submitted).length} submitted</p>
                        </div>

                        <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Download className="w-5 h-5 text-green-600" />
                            <p className="font-semibold text-slate-800">Resources</p>
                          </div>
                          <p className="text-3xl font-bold text-green-600 mb-1">{resources.length}</p>
                          <p className="text-sm text-slate-600">Study materials</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'assignments' && (
                    <div className="space-y-3">
                      {assignments.length === 0 ? (
                        <p className="text-center text-slate-500 py-8">No assignments yet</p>
                      ) : (
                        assignments.map((assignment) => (
                          <div key={assignment.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-shadow">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
                              <div className="flex-1">
                                <h4 className="font-semibold text-slate-800">{assignment.title}</h4>
                                <p className="text-sm text-slate-600">Points: {assignment.points}</p>
                              </div>
                              {assignment.submitted && (
                                <div className="flex items-center gap-2 text-green-600 font-medium">
                                  <CheckCircle className="w-5 h-5" />
                                  Score: {assignment.score}
                                </div>
                              )}
                            </div>
                            {assignment.due_date && (
                              <p className="text-xs text-slate-500">Due: {new Date(assignment.due_date).toLocaleDateString()}</p>
                            )}
                            {!assignment.submitted && (
                              <button className="mt-3 w-full sm:w-auto px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                                <Upload className="w-4 h-4" />
                                Submit
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'resources' && (
                    <div className="space-y-3">
                      {resources.length === 0 ? (
                        <p className="text-center text-slate-500 py-8">No resources shared yet</p>
                      ) : (
                        resources.map((resource) => (
                          <div key={resource.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-shadow flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-slate-800 break-words">{resource.title}</h4>
                              <p className="text-sm text-slate-600">{resource.resource_type}</p>
                            </div>
                            <button className="ml-4 flex-shrink-0 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium">
                              Open
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'attendance' && attendance && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                          { label: 'Total Classes', value: attendance.total },
                          { label: 'Present', value: attendance.present, color: 'text-green-600' },
                          { label: 'Attendance %', value: `${attendance.percentage}%`, color: 'text-blue-600' },
                          { label: 'Status', value: attendance.percentage >= 75 ? '✓ Good' : '⚠ Low', color: attendance.percentage >= 75 ? 'text-green-600' : 'text-orange-600' }
                        ].map((item, idx) => (
                          <div key={idx} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-600 font-medium">{item.label}</p>
                            <p className={`text-2xl font-bold ${item.color || 'text-slate-800'}`}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg p-12 text-center border border-slate-200">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 text-lg">No courses to display</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
