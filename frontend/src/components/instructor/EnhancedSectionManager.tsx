import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
  Users,
  AlertCircle,
  Loader2,
  Mail,
  UserCheck,
  BookOpen,
  Calendar,
  ChevronRight,
  GraduationCap,
  BarChart2,
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

function getAttendanceColor(pct?: number) {
  if (pct === undefined) return { bar: 'bg-gray-300', text: 'text-gray-500' };
  if (pct >= 75) return { bar: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
  if (pct >= 50) return { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' };
  return { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' };
}

export function EnhancedSectionManager({ onSectionSelect }: EnhancedSectionManagerProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setEnrolledStudents((res[0].students as unknown as EnrolledStudent[]) || []);
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
    if (onSectionSelect) onSectionSelect(section.id, section.name);
  };

  const avgAttendance =
    enrolledStudents.length > 0
      ? enrolledStudents.reduce((s, st) => s + (st.attendance_percentage ?? 0), 0) /
      enrolledStudents.length
      : 0;

  /* ── Loading ───────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  /* ── Error ─────────────────────────────────────────────── */
  if (error) {
    return (
      <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
          <button
            onClick={() => { setError(null); fetchSections(); }}
            className="text-xs text-red-600 dark:text-red-400 underline mt-1"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* ── Empty ─────────────────────────────────────────────── */
  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
          <BookOpen className="w-8 h-8 text-gray-400" />
        </div>
        <p className="text-gray-500 dark:text-gray-400">No sections assigned yet.</p>
        <p className="text-sm text-gray-400 dark:text-gray-500">Contact your admin to be assigned to a class.</p>
      </div>
    );
  }

  /* ── Main ──────────────────────────────────────────────── */
  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Page title ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-green-600" />
          My Classes
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {sections.length} section{sections.length !== 1 ? 's' : ''} assigned to you
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT: Section cards ── */}
        <div className="space-y-3">
          {sections.map((section) => {
            const students = (section.students as unknown as EnrolledStudent[]) || [];
            const avg =
              students.length > 0
                ? students.reduce((s, st) => s + (st.attendance_percentage ?? 0), 0) /
                students.length
                : 0;
            const isSelected = selectedSection?.id === section.id;
            return (
              <button
                key={section.id}
                onClick={() => handleSectionSelect(section)}
                className={`w-full text-left rounded-2xl border p-5 transition-all duration-200 group
                  ${isSelected
                    ? 'bg-green-600 border-green-600 shadow-lg shadow-green-500/20'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-green-300 dark:hover:border-green-700 hover:shadow-md'
                  }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                      ${isSelected ? 'bg-white/20' : 'bg-green-50 dark:bg-green-900/30'}`}
                  >
                    <BookOpen
                      className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-green-600 dark:text-green-400'}`}
                    />
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 mt-1 transition-transform ${isSelected
                      ? 'text-white/80 translate-x-0.5'
                      : 'text-gray-400 group-hover:translate-x-0.5'
                      }`}
                  />
                </div>

                <p
                  className={`font-bold text-sm leading-snug mb-1 ${isSelected ? 'text-white' : 'text-gray-900 dark:text-white'
                    }`}
                >
                  {section.class_name ? `${section.class_name} – ${section.name}` : section.name}
                </p>
                <p
                  className={`text-xs mb-4 ${isSelected ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
                    }`}
                >
                  {students.length} student{students.length !== 1 ? 's' : ''}
                  {avg > 0 && ` · ${avg.toFixed(0)}% avg attendance`}
                </p>

                {/* Attendance mini-bar */}
                <div className={`w-full h-1.5 rounded-full ${isSelected ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${isSelected ? 'bg-white' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(avg, 100)}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* ── RIGHT: Section detail ── */}
        <div className="lg:col-span-2">
          {!selectedSection ? (
            <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl">
              <Users className="w-10 h-10 text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Select a section to view details</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Section header card ── */}
              <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-6 text-white shadow-lg shadow-green-500/20 relative overflow-hidden">
                {/* decorative blur */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />

                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold leading-tight">
                        {selectedSection.class_name
                          ? `${selectedSection.class_name} – ${selectedSection.name}`
                          : selectedSection.name}
                      </h2>
                      <p className="text-green-200 text-sm mt-1 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5" />
                        Created {new Date(selectedSection.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-semibold backdrop-blur">
                      {enrolledStudents.length} enrolled
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/10 rounded-xl p-3 backdrop-blur">
                      <p className="text-xs text-green-200 mb-1">Students</p>
                      <p className="text-2xl font-bold">{enrolledStudents.length}</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3 backdrop-blur">
                      <p className="text-xs text-green-200 mb-1">Avg Attendance</p>
                      <p className="text-2xl font-bold">{avgAttendance.toFixed(0)}%</p>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3 backdrop-blur">
                      <p className="text-xs text-green-200 mb-1">Good Attendance</p>
                      <p className="text-2xl font-bold">
                        {enrolledStudents.filter(s => (s.attendance_percentage ?? 0) >= 75).length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Student list ── */}
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-green-600" />
                    Enrolled Students
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                    {enrolledStudents.length} total
                  </span>
                </div>

                {enrolledStudents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
                      <Users className="w-7 h-7 text-gray-400" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No students enrolled yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {enrolledStudents.map((student, idx) => {
                      const atColor = getAttendanceColor(student.attendance_percentage);
                      return (
                        <div
                          key={student.id}
                          className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow">
                            {student.full_name?.charAt(0)?.toUpperCase() || '?'}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">
                              {student.full_name}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1 truncate">
                                <Mail className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{student.email}</span>
                              </span>
                              {student.roll_number && (
                                <span className="hidden sm:inline">#{student.roll_number}</span>
                              )}
                            </div>
                          </div>

                          {/* Attendance */}
                          {student.attendance_percentage !== undefined && (
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <span className={`text-sm font-bold ${atColor.text}`}>
                                {student.attendance_percentage.toFixed(0)}%
                              </span>
                              <div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ${atColor.bar}`}
                                  style={{ width: `${Math.min(student.attendance_percentage, 100)}%` }}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <UserCheck className="w-3 h-3 text-gray-400" />
                                <span className="text-[10px] text-gray-400 hidden sm:inline">attendance</span>
                              </div>
                            </div>
                          )}

                          {/* Row number */}
                          <span className="text-xs text-gray-300 dark:text-gray-700 font-medium w-5 text-right flex-shrink-0">
                            {idx + 1}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer note */}
                <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                  <BarChart2 className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Enrollment is managed by your institution's admin.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
