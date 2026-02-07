import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import {
  BookOpen,
  AlertCircle,
  Loader2,
  BarChart3,
  Clock,
  Users,
  FileText,
  ChevronRight,
} from 'lucide-react';

interface Section {
  id: string;
  name: string;
  chatbot_id: string;
  teacher_name: string;
  created_at: string;
  student_count?: number;
  attendance_percentage?: number;
  pending_assignments?: number;
}

interface EnrolledSectionsProps {
  onSectionSelect?: (sectionId: string, sectionName?: string) => void;
}

export function EnrolledSections({ onSectionSelect }: EnrolledSectionsProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const data = await api.get<{ sections: Section[]; count?: number }>(
          '/student/sections'
        );
        setSections(data.sections || []);
      } catch (err) {
        console.error(err);
        setError(
          'Failed to load your enrolled sections. Please try again later.'
        );
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
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Loading your sections...
          </p>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            My Sections
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {sections.length === 0
              ? 'No enrolled sections'
              : `You're enrolled in ${sections.length} section${sections.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-gray-400 dark:text-gray-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No sections yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            You're not enrolled in any sections yet. Ask your instructor to add
            you to a section.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sections.map((section) => (
            <div
              key={section.id}
              className="group relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-emerald-950/30 transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden"
              onClick={() => onSectionSelect?.(section.id, section.name)}
            >
              {/* Gradient accent bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <BookOpen className="h-6 w-6" />
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-full">
                  Active
                </span>
              </div>

              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1 line-clamp-1">
                {section.name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Taught by{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  {section.teacher_name || 'Unknown'}
                </span>
              </p>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="text-center">
                  <div className="flex items-center justify-center h-8 mb-1">
                    <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    {section.attendance_percentage?.toFixed(1) || 0}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Attendance
                  </p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center h-8 mb-1">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    {section.pending_assignments || 0}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Pending
                  </p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center h-8 mb-1">
                    <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    {section.student_count || 0}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Students
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    Started{' '}
                    {new Date(section.created_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();

                  }}
                  className="flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform"
                >
                  View <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
