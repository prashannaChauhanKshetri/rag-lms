import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
  AlertCircle,
  Loader2,
  BarChart3,
  FileText,
} from 'lucide-react';

interface StudentRecord {
  student_id: string;
  username: string;
  full_name: string;
  email: string;
  roll_number?: string;
  department?: string;
  present_count: number;
  absent_count: number;
  late_count: number;
  excused_count: number;
  attendance_percentage: number;
}

interface AttendanceReportProps {
  sectionId?: string;
  sectionName?: string;
}

export function AttendanceReportView({
  sectionId,
  sectionName,
}: AttendanceReportProps) {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [reportData, setReportData] = useState<{
    section_id: string;
    start_date: string;
    end_date: string;
    total_classes: number;
    student_records: StudentRecord[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'attendance'>('name');

  const [sections, setSections] = useState<Array<{ id: string; name: string }>>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(sectionId || null);

  // Fetch instructor's sections so user can pick one from dropdown
  const fetchSections = async () => {
    try {
      setSectionsLoading(true);
      const res = await api.get<any[]>(`/instructor/sections/all`);
      setSections(res || []);
      if (!selectedSectionId && res && res.length > 0) {
        setSelectedSectionId(res[0].id);
      }
    } catch (err) {
      setError(`Failed to fetch sections: ${err}`);
    } finally {
      setSectionsLoading(false);
    }
  };

  // load sections on mount and when prop changes
  useEffect(() => {
    fetchSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If parent passes a sectionId, keep it in sync
  useEffect(() => {
    if (sectionId) setSelectedSectionId(sectionId);
  }, [sectionId]);

  // Clear report when section changes
  useEffect(() => {
    setReportData(null);
  }, [selectedSectionId]);

  const fetchReport = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date must be before end date');
      return;
    }

    try {
      if (!selectedSectionId) {
        setError('Please select a section');
        return;
      }
      setIsLoading(true);
      setError(null);

      const response = await api.post<{
        section_id: string;
        start_date: string;
        end_date: string;
        total_classes: number;
        student_records: StudentRecord[];
      }>(
        `/instructor/sections/${selectedSectionId}/attendance-report`,
        {
          start_date: startDate,
          end_date: endDate,
        }
      );

      setReportData(response);
    } catch (err) {
      setError(`Failed to generate report: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const sortedRecords = reportData?.student_records
    ? [...reportData.student_records].sort((a, b) => {
      if (sortBy === 'name') {
        return a.full_name.localeCompare(b.full_name);
      } else {
        return b.attendance_percentage - a.attendance_percentage;
      }
    })
    : [];



  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 90) return 'text-emerald-600 dark:text-emerald-400';
    if (percentage >= 75) return 'text-blue-600 dark:text-blue-400';
    if (percentage >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Attendance Report
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Section: <span className="font-medium">{sections.find(s => s.id === selectedSectionId)?.name || sectionName || '—'}</span>
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Section
            </label>
            {sectionsLoading ? (
              <div className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            ) : sections.length === 0 ? (
              <div className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
                You have no sections
              </div>
            ) : (
              <select
                value={selectedSectionId || ''}
                onChange={(e) => setSelectedSectionId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                {sections.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:border-transparent"
            />
          </div>

          <div className="flex items-end sm:col-span-2 md:col-span-1 lg:col-span-1">
            <button
              onClick={fetchReport}
              disabled={isLoading || !selectedSectionId}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4" />
                  Generate Report
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}
      </div>

      {/* Report Results */}
      {reportData && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Total Classes
              </p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                {reportData.total_classes || 0}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Students Tracked
              </p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                {reportData.student_records?.length || 0}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Avg. Attendance
              </p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {reportData.student_records?.length
                  ? (
                    reportData.student_records.reduce(
                      (sum: number, r: StudentRecord) => sum + (r.attendance_percentage || 0),
                      0
                    ) / reportData.student_records.length
                  ).toFixed(1)
                  : '0'}
                %
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4 col-span-2 lg:col-span-1">
              <p className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Date Range
              </p>
              <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                {new Date(reportData.start_date).toLocaleDateString()} - {new Date(reportData.end_date).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Student Records Table */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Student Attendance
              </h3>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Sort by:
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'name' | 'attendance')}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="name">Name</option>
                  <option value="attendance">Attendance %</option>
                </select>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold text-gray-900 dark:text-white">
                      Student
                    </th>
                    <th className="px-6 py-3 text-center font-semibold text-gray-900 dark:text-white">
                      Present
                    </th>
                    <th className="px-6 py-3 text-center font-semibold text-gray-900 dark:text-white">
                      Absent
                    </th>
                    <th className="px-6 py-3 text-center font-semibold text-gray-900 dark:text-white">
                      Late
                    </th>
                    <th className="px-6 py-3 text-center font-semibold text-gray-900 dark:text-white">
                      Excused
                    </th>
                    <th className="px-6 py-3 text-right font-semibold text-gray-900 dark:text-white">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {sortedRecords.length > 0 ? (
                    sortedRecords.map((record: StudentRecord) => (
                      <tr
                        key={record.student_id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {record.full_name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {record.email}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-semibold">
                            {record.present_count || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-semibold">
                            {record.absent_count || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-semibold">
                            {record.late_count || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold">
                            {record.excused_count || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span
                            className={`font-bold ${getAttendanceColor(
                              record.attendance_percentage
                            )}`}
                          >
                            {record.attendance_percentage?.toFixed(1) || '0'}%
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        No records found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden divide-y divide-gray-200 dark:divide-gray-800">
              {sortedRecords.length > 0 ? (
                sortedRecords.map((record: StudentRecord) => (
                  <div key={record.student_id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">
                          {record.full_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {record.email}
                        </p>
                      </div>
                      <span
                        className={`font-bold text-lg ${getAttendanceColor(
                          record.attendance_percentage
                        )}`}
                      >
                        {record.attendance_percentage?.toFixed(1) || '0'}%
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Pres.</p>
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{record.present_count || 0}</p>
                      </div>
                      <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">Abs.</p>
                        <p className="text-sm font-bold text-red-700 dark:text-red-300">{record.absent_count || 0}</p>
                      </div>
                      <div className="text-center p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Late</p>
                        <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{record.late_count || 0}</p>
                      </div>
                      <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Exc.</p>
                        <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{record.excused_count || 0}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">
                  No records found
                </div>
              )}
            </div>
          </div>

          {/* Export Button */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                // CSV export logic
                const csv = [
                  [
                    'Student ID',
                    'Name',
                    'Email',
                    'Present',
                    'Absent',
                    'Late',
                    'Excused',
                    'Attendance %',
                  ].join(','),
                  ...sortedRecords.map((r: StudentRecord) =>
                    [
                      r.student_id,
                      r.full_name,
                      r.email,
                      r.present_count,
                      r.absent_count,
                      r.late_count,
                      r.excused_count,
                      r.attendance_percentage?.toFixed(2),
                    ].join(',')
                  ),
                ].join('\n');

                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `attendance-report-${selectedSectionId || 'all'}-${new Date().getTime()}.csv`;
                link.click();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors font-medium"
            >
              <FileText className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
