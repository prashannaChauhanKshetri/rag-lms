import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
  BookOpen,
  BarChart3,
  FileText,
  AlertCircle,
  Loader2,
  ChevronDown,
  Download,
  User,
  Mail,
} from 'lucide-react';

interface Section {
  id: string;
  name: string;
  subject_name?: string;
  chatbot_id: string;
  teacher_name: string;
  created_at: string;
}

interface Assignment {
  id: string;
  title: string;
  due_date?: string;
  points: number;
  is_published: boolean;
  submitted?: boolean;
  score?: number;
  description?: string;
}

interface Resource {
  id: string;
  title: string;
  resource_type: string;
  url?: string;
  file_path?: string;
  created_at?: string;
}

interface Attendance {
  total: number;
  present: number;
  percentage: number;
  records?: Array<{
    date: string;
    status: 'present' | 'absent' | 'late' | 'excused';
  }>;
}

export interface SectionOverviewProps {
  sectionId: string;
  chatbotId?: string;
}

export function SectionOverview({ sectionId, chatbotId }: SectionOverviewProps) {
  const [section, setSection] = useState<Section | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'assignments' | 'resources' | 'attendance'
  >('overview');
  const [teacher, setTeacher] = useState<{ full_name?: string; email?: string } | null>(null);
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(
    null
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Fetch section overview
        const sectionRes = await api.get<{
          section: Section;
          teacher: { full_name?: string; email?: string };
          assignments: Assignment[];
          resources: Resource[];
          attendance: Attendance;
        }>(
          `/student/sections/${sectionId}${chatbotId ? `?chatbot_id=${chatbotId}` : ''}`
        );

        setSection(sectionRes.section);
        setAssignments(sectionRes.assignments || []);
        setResources(sectionRes.resources || []);
        setAttendance(sectionRes.attendance || null);
        setTeacher(sectionRes.teacher);
        setError(null);
      } catch (err) {
        setError(`Failed to load section: ${err}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [sectionId]);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Loading section details...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {section?.subject_name || section?.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
              Started{' '}
              <span className="font-medium">
                {section && new Date(section.created_at).toLocaleDateString()}
              </span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex items-center justify-center">
            <BookOpen className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
      </div>

      {/* Teacher Card */}
      {teacher && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
              <User className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">
                Instructor
              </p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {teacher.full_name || 'Unknown'}
              </p>
              {teacher.email && (
                <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 mt-1">
                  <Mail className="h-4 w-4" />
                  <a
                    href={`mailto:${teacher.email}`}
                    className="hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    {teacher.email}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Attendance Rate
            </p>
            <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {attendance?.percentage?.toFixed(1) || '0'}%
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {attendance?.present || 0} of {attendance?.total || 0} classes
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Assignments
            </p>
            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            {assignments.length}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {assignments.filter((a) => a.submitted).length} submitted
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Resources
            </p>
            <Download className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {resources.length}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Files available
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-800 flex gap-1 bg-white dark:bg-gray-900 rounded-t-xl">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'assignments', label: 'Assignments' },
            { id: 'resources', label: 'Resources' },
            { id: 'attendance', label: 'Attendance' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
              ? 'border-emerald-600 dark:border-emerald-400 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="bg-white dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Course Information
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">
                    ID:
                  </span>
                  <code className="text-gray-700 dark:text-gray-300 font-mono">
                    {section?.id}
                  </code>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">
                    Course:
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {section?.chatbot_id}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">
                    Started:
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {section &&
                      new Date(section.created_at).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Quick Stats
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                  <span className="text-gray-600 dark:text-gray-400">
                    Classes Attended
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {attendance?.present || 0}/{attendance?.total || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                  <span className="text-gray-600 dark:text-gray-400">
                    Pending Assignments
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {assignments.filter((a) => !a.submitted).length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded">
                  <span className="text-gray-600 dark:text-gray-400">
                    Materials Shared
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {resources.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignments Tab */}
      {activeTab === 'assignments' && (
        <div className="bg-white dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-xl overflow-hidden">
          {assignments.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400">
                No assignments yet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <button
                    onClick={() =>
                      setExpandedAssignment(
                        expandedAssignment === assignment.id ? null : assignment.id
                      )
                    }
                    className="w-full flex items-start justify-between text-left"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white">
                          {assignment.title}
                        </h4>
                        {assignment.submitted && (
                          <span className="text-xs font-semibold px-2.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full">
                            Submitted
                          </span>
                        )}
                        {!assignment.submitted && (
                          <span className="text-xs font-semibold px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {assignment.points} points{' '}
                        {assignment.due_date &&
                          `• Due ${new Date(assignment.due_date).toLocaleDateString()}`}
                      </p>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 text-gray-400 transition-transform ${expandedAssignment === assignment.id ? 'rotate-180' : ''
                        }`}
                    />
                  </button>

                  {expandedAssignment === assignment.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
                      {assignment.description && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Description
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {assignment.description}
                          </p>
                        </div>
                      )}
                      {assignment.submitted && assignment.score !== null && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Score
                          </p>
                          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {assignment.score} / {assignment.points} points
                          </p>
                        </div>
                      )}
                      <button className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300">
                        View Details →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resources Tab */}
      {activeTab === 'resources' && (
        <div className="bg-white dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-xl overflow-hidden">
          {resources.length === 0 ? (
            <div className="p-12 text-center">
              <Download className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400">
                No resources shared yet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {resources.map((resource) => (
                <div
                  key={resource.id}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex items-center justify-between"
                >
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {resource.title}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {resource.resource_type}
                      {resource.created_at &&
                        ` • ${new Date(resource.created_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 p-2">
                    <Download className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attendance Tab */}
      {activeTab === 'attendance' && (
        <div className="bg-white dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-xl p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {attendance?.present || 0}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium mt-1">
                  Present
                </p>
              </div>
              <div className="text-center p-4 bg-red-50 dark:bg-red-900/30 rounded-lg">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {(attendance?.total || 0) - (attendance?.present || 0)}
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 font-medium mt-1">
                  Absent
                </p>
              </div>
              <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {attendance?.total || 0}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium mt-1">
                  Total
                </p>
              </div>
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {attendance?.percentage?.toFixed(1) || '0'}%
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mt-1">
                  Percentage
                </p>
              </div>
            </div>

            {attendance?.records && attendance.records.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Recent Records
                </h4>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {attendance.records.slice(0, 10).map((record, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 rounded text-sm"
                    >
                      <span className="text-gray-700 dark:text-gray-300">
                        {new Date(record.date).toLocaleDateString()}
                      </span>
                      <span
                        className={`font-medium ${record.status === 'present'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : record.status === 'absent'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                          }`}
                      >
                        {record.status.charAt(0).toUpperCase() +
                          record.status.slice(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
