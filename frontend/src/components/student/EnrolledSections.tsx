import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  BookOpen,
  AlertCircle,
  Loader2,
  Clock,
  Users,
  FileText,
  ChevronRight,
  FlaskConical,
  Globe,
  Calculator,
  Microscope,
  Languages,
  Monitor,
} from 'lucide-react';

interface EnrolledClass {
  section_id: string;
  section_name: string;
  class_name: string;
  chatbot_id: string;
  subject_name: string;
  teacher_name: string;
  teacher_email?: string;
  created_at: string;
  student_count?: number;
  attendance_percentage?: number;
  pending_assignments?: number;
}

interface EnrolledSectionsProps {
  onSectionSelect?: (sectionId: string, sectionName?: string, chatbotId?: string) => void;
}

// Palette: each color scheme has gradient, button gradient, icon bg, ring color
const CARD_THEMES = [
  {
    gradient: 'from-emerald-600 via-green-500 to-teal-600',
    btn: 'from-emerald-700 to-teal-700',
    iconBg: 'bg-emerald-500/30',
    ring: '#10b981',
    textAccent: 'text-emerald-600',
    circleBg: '#d1fae5',
  },
  {
    gradient: 'from-violet-600 via-purple-500 to-indigo-600',
    btn: 'from-violet-700 to-indigo-700',
    iconBg: 'bg-violet-500/30',
    ring: '#8b5cf6',
    textAccent: 'text-violet-600',
    circleBg: '#ede9fe',
  },
  {
    gradient: 'from-orange-500 via-red-500 to-rose-600',
    btn: 'from-orange-600 to-rose-700',
    iconBg: 'bg-orange-500/30',
    ring: '#f97316',
    textAccent: 'text-orange-600',
    circleBg: '#ffedd5',
  },
  {
    gradient: 'from-sky-500 via-blue-500 to-cyan-600',
    btn: 'from-sky-600 to-cyan-700',
    iconBg: 'bg-sky-500/30',
    ring: '#0ea5e9',
    textAccent: 'text-sky-600',
    circleBg: '#e0f2fe',
  },
  {
    gradient: 'from-teal-500 via-cyan-500 to-blue-500',
    btn: 'from-teal-600 to-blue-700',
    iconBg: 'bg-teal-500/30',
    ring: '#14b8a6',
    textAccent: 'text-teal-600',
    circleBg: '#ccfbf1',
  },
  {
    gradient: 'from-lime-500 via-green-500 to-emerald-600',
    btn: 'from-lime-600 to-emerald-700',
    iconBg: 'bg-lime-500/30',
    ring: '#84cc16',
    textAccent: 'text-lime-600',
    circleBg: '#ecfccb',
  },
];

const SUBJECT_ICONS = [BookOpen, Calculator, FlaskConical, Globe, Languages, Monitor, Microscope, FileText];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function generateSubjectCode(subjectName: string, sectionName: string): string {
  const subWords = subjectName.split(' ');
  const prefix = subWords.map((w) => w[0]?.toUpperCase() || '').join('').slice(0, 3);
  const suffix = sectionName.replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase();
  return `${prefix}-${suffix || '7B'}`;
}

/** SVG circular attendance ring */
function AttendanceCircle({
  percentage,
  color,
  bgColor,
}: {
  percentage: number;
  color: string;
  bgColor: string;
}) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(percentage, 0), 100);
  const dash = (pct / 100) * circ;
  const gap = circ - dash;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 68, height: 68 }}>
      <svg width="68" height="68" className="rotate-[-90deg]">
        {/* track */}
        <circle cx="34" cy="34" r={r} fill="none" stroke={bgColor} strokeWidth="6" />
        {/* progress */}
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
        />
      </svg>
      <span
        className="absolute text-sm font-bold"
        style={{ color }}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}

export function EnrolledSections({ onSectionSelect }: EnrolledSectionsProps) {
  const [classes, setClasses] = useState<EnrolledClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const data = await api.get<{ sections: EnrolledClass[]; count?: number }>(
          '/student/sections'
        );
        setClasses(data.sections || []);
      } catch (err) {
        console.error(err);
        setError('Failed to load your enrolled sections. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSections();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading your subjects…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex card bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-4 rounded-lg items-center gap-3 text-red-700 dark:text-red-200">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Subjects</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {classes.length === 0
            ? 'No enrolled subjects'
            : `You have ${classes.length} active enrollment${classes.length === 1 ? '' : 's'} this semester`}
        </p>
      </div>

      {classes.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-gray-400 dark:text-gray-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No subjects yet</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto text-sm">
            You're not enrolled in any sections yet. Ask your instructor to add you to a section.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((item, idx) => {
            const theme = CARD_THEMES[idx % CARD_THEMES.length];
            const SubjectIcon = SUBJECT_ICONS[idx % SUBJECT_ICONS.length];
            const code = generateSubjectCode(item.subject_name, item.section_name);
            const attendance = item.attendance_percentage ?? 0;
            const pending = item.pending_assignments ?? 0;
            const classmates = item.student_count ?? 0;
            const teacherInitials = item.teacher_name ? getInitials(item.teacher_name) : '??';
            const enrolledDate = item.created_at
              ? new Date(item.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
              : '';

            return (
              <div
                key={`${item.section_id}-${item.chatbot_id}`}
                className="group rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-gray-900 flex flex-col"
              >
                {/* ── Colorful card header ── */}
                <div className={`relative bg-gradient-to-br ${theme.gradient} p-5 pb-6`}>
                  {/* Pattern overlay */}
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)',
                      backgroundSize: '30px 30px',
                    }}
                  />

                  {/* Top row: code badge + Active pill */}
                  <div className="relative flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-white/90 bg-white/20 px-2 py-0.5 rounded-md tracking-wider">
                      {code}
                    </span>
                    <span className="text-xs font-semibold bg-white/20 text-white px-2.5 py-0.5 rounded-full border border-white/30">
                      ✓ Active
                    </span>
                  </div>

                  {/* Icon + subject name */}
                  <div className="relative flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl ${theme.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <SubjectIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white leading-tight">{item.subject_name}</h3>
                      <p className="text-xs text-white/80 mt-0.5">
                        {item.class_name} • {item.section_name}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Card body ── */}
                <div className="p-4 flex flex-col flex-1">
                  {/* Instructor row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {/* Avatar */}
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: theme.ring }}
                      >
                        {teacherInitials}
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">
                          Instructor
                        </p>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white leading-tight">
                          {item.teacher_name || 'Assigned Teacher'}
                        </p>
                      </div>
                    </div>
                    {enrolledDate && (
                      <div className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{enrolledDate}</span>
                      </div>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {/* Attendance circle */}
                    <div className="flex flex-col items-center bg-gray-50 dark:bg-gray-800/60 rounded-xl py-3 px-1">
                      <AttendanceCircle
                        percentage={attendance}
                        color={theme.ring}
                        bgColor={theme.circleBg}
                      />
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 font-medium">
                        Attendance
                      </p>
                    </div>

                    {/* Pending */}
                    <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800/60 rounded-xl py-3 gap-1">
                      <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-orange-500" />
                      </div>
                      <span
                        className={`text-xl font-bold ${pending > 0 ? 'text-orange-500' : 'text-emerald-500'}`}
                      >
                        {pending}
                      </span>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Pending</p>
                    </div>

                    {/* Classmates */}
                    <div className="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800/60 rounded-xl py-3 gap-1">
                      <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-500" />
                      </div>
                      <span className="text-xl font-bold text-gray-800 dark:text-white">{classmates}</span>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Classmates</p>
                    </div>
                  </div>

                  {/* View Course button */}
                  <button
                    onClick={() =>
                      onSectionSelect?.(item.section_id, item.section_name, item.chatbot_id)
                    }
                    className={`w-full py-2.5 rounded-xl text-white text-sm font-semibold bg-gradient-to-r ${theme.btn} hover:opacity-90 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2 shadow-sm mt-auto`}
                  >
                    View Course
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
