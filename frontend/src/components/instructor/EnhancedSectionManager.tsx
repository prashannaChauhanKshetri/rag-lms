import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
  Users,
  AlertCircle,
  Loader2,
  ChevronDown,
  Mail,
  Hash,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';

interface EnhancedSectionManagerProps {
  chatbotId?: string;
  onSectionSelect?: (sectionId: string, sectionName?: string) => void;
}

interface Section {
  id: string;
  name: string;
  chatbot_id: string;
  teacher_id: string;
  created_at: string;
  description?: string;
  max_students?: number;
  status?: string;
  class_name?: string;
  students?: EnrolledStudent[];
}

interface EnrolledStudent {
  id: string;
  student_id: string;
  username: string;
  full_name: string;
  email: string;
  enrolled_at: string;
  roll_number?: string;
  department?: string;
  profile_picture_url?: string;
  attendance_percentage?: number;
}


export function EnhancedSectionManager({ onSectionSelect }: EnhancedSectionManagerProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  useEffect(() => {
    fetchSections();
  }, []);

  const fetchSections = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<Section[]>(`/instructor/sections/all`);
      setSections(res || []);
      if (res && res.length > 0) {
        setSelectedSection(res[0]);
        // Students are already loaded in the response
        const students = (res[0].students as unknown as EnrolledStudent[]) || [];
        setEnrolledStudents(students);
      }
    } catch (err) {
      setError(`Failed to fetch sections: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSectionSelect = (section: Section) => {
    setSelectedSection(section);
    setEnrolledStudents((section.students as unknown as EnrolledStudent[]) || []);
    if (onSectionSelect) {
      onSectionSelect(section.id, section.name);
    }
  };



  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-600 dark:text-red-400 hover:underline mt-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sections Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                Sections
              </h3>
              <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full">
                {sections.length}
              </span>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-800">
              {isLoading && sections.length === 0 ? (
                <div className="p-4 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400 mx-auto" />
                </div>
              ) : sections.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-600 dark:text-gray-400">
                  No sections yet
                </div>
              ) : (
                sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => handleSectionSelect(section)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${selectedSection?.id === section.id
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-emerald-600 dark:border-emerald-400'
                      : ''
                      }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      {section.class_name ? `${section.class_name} - ${section.name}` : section.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {section.chatbot_id}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {!selectedSection ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
              <Users className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400">
                Select a section to manage
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Section Header */}
              <div className="bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedSection.class_name ? `${selectedSection.class_name} - ${selectedSection.name}` : selectedSection.name}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                      {selectedSection.chatbot_id} • Created{' '}
                      {new Date(selectedSection.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Admin Contact Banner */}
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Section management is now handled by administrators. Contact your admin to make changes.
                  </p>
                </div>
              </div>

              {/* Enrollments Header */}
              <div className="border-b border-gray-200 dark:border-gray-800 flex gap-1 bg-white dark:bg-gray-900 rounded-t-xl overflow-x-auto no-scrollbar scroll-smooth">
                <div
                  className="px-4 py-2.5 text-sm font-medium border-b-2 border-emerald-600 dark:border-emerald-400 text-emerald-600 dark:text-emerald-400 flex items-center gap-2 whitespace-nowrap"
                >
                  Enrollments
                  {enrolledStudents.length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full">
                      {enrolledStudents.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Enrollments Content */}
              <div className="bg-white dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-xl">
                {/* Read-Only Notice */}
                <div className="border-b border-gray-200 dark:border-gray-800 p-4 bg-blue-50 dark:bg-blue-900/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Read-Only View
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                        Enrollment management has been moved to the Admin role. Contact your institution's registrar to enroll or remove students.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Enrolled Students List */}
                {enrolledStudents.length === 0 ? (
                  <div className="p-12 text-center">
                    <Users className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-600 dark:text-gray-400">
                      No students enrolled yet
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-800">
                    {enrolledStudents.map((student) => (
                      <div
                        key={student.id}
                        className="p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <button
                          onClick={() =>
                            setExpandedStudent(
                              expandedStudent === student.id ? null : student.id
                            )
                          }
                          className="w-full flex items-start justify-between text-left"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-gray-900 dark:text-white">
                                {student.full_name}
                              </h4>
                              {student.attendance_percentage &&
                                student.attendance_percentage >= 75 && (
                                  <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full">
                                    Good Attendance
                                  </span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 sm:gap-4 text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {student.roll_number && (
                                <div className="flex items-center gap-1">
                                  <Hash className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                  {student.roll_number}
                                </div>
                              )}
                              <div className="flex items-center gap-1 min-w-0">
                                <Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                                <span className="truncate">{student.email}</span>
                              </div>
                              {student.attendance_percentage !== undefined && (
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <UserCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                  {student.attendance_percentage.toFixed(1)}% attendance
                                </div>
                              )}
                            </div>
                          </div>
                          <ChevronDown
                            className={`h-5 w-5 text-gray-400 transition-transform flex-shrink-0 ${expandedStudent === student.id ? 'rotate-180' : ''
                              }`}
                          />
                        </button>

                        {expandedStudent === student.id && (
                          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              <span className="font-medium">
                                Enrolled{' '}
                                {new Date(student.enrolled_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
