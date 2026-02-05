import { useState, useEffect } from 'react';
import { Calendar, Check, X, Clock, FileText, ChevronDown } from 'lucide-react';

interface Student {
  id: string;
  full_name: string;
  username: string;
  email: string;
}

interface Section {
  id: string;
  name: string;
  student_count?: number;
}

interface AttendanceRecord {
  student_id: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
}

export default function AttendanceManager({ sectionId: initialSectionId }: { sectionId?: string }) {
  const [selectedSectionId, setSelectedSectionId] = useState(initialSectionId || '');
  const [sections, setSections] = useState<Section[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sectionsLoading, setSectionsLoading] = useState(true);

  // Fetch sections list
  useEffect(() => {
    const fetchSections = async () => {
      try {
        const res = await fetch('/instructor/sections', {
          credentials: 'include'
        });
        const data = await res.json();
        setSections(data.sections || []);
        
        // Auto-select first section if none selected
        if (data.sections?.length > 0) {
          setSelectedSectionId(data.sections[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch sections:', error);
      } finally {
        setSectionsLoading(false);
      }
    };

    fetchSections();
  }, []);

  // Fetch enrolled students when section changes
  useEffect(() => {
    const fetchStudents = async () => {
      if (!selectedSectionId) {
        setStudents([]);
        setAttendance(new Map());
        return;
      }

      try {
        const res = await fetch(`/instructor/sections/${selectedSectionId}/details`, {
          credentials: 'include'
        });
        const data = await res.json();
        setStudents(data.students || []);
        
        // Initialize attendance map
        const initialAttendance = new Map();
        data.students.forEach((s: Student) => {
          initialAttendance.set(s.id, { student_id: s.id, status: 'present' });
        });
        setAttendance(initialAttendance);
      } catch (error) {
        console.error('Failed to fetch students:', error);
      }
    };

    fetchStudents();
  }, [selectedSectionId]);

  const updateAttendance = (studentId: string, status: 'present' | 'absent' | 'late' | 'excused') => {
    const rec = attendance.get(studentId) || { student_id: studentId, status: 'present' };
    rec.status = status;
    setAttendance(new Map(attendance.set(studentId, rec)));
    setSaved(false);
  };

  const updateNotes = (studentId: string, notes: string) => {
    const rec = attendance.get(studentId) || { student_id: studentId, status: 'present' };
    rec.notes = notes;
    setAttendance(new Map(attendance.set(studentId, rec)));
  };

  const saveAttendance = async () => {
    if (!selectedSectionId) {
      alert('Please select a section');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        date,
        students: Array.from(attendance.values())
      };

      const res = await fetch(`/instructor/sections/${selectedSectionId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert('Failed to save attendance');
      }
    } catch (error) {
      console.error('Error saving attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusColors = {
    present: 'bg-green-100 text-green-800 border-green-300',
    absent: 'bg-red-100 text-red-800 border-red-300',
    late: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    excused: 'bg-blue-100 text-blue-800 border-blue-300'
  };

  const statusIcons = {
    present: <Check className="w-4 h-4" />,
    absent: <X className="w-4 h-4" />,
    late: <Clock className="w-4 h-4" />,
    excused: <FileText className="w-4 h-4" />
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Mark Attendance</h2>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setSaved(false);
          }}
          className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* Section Selector */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Section</label>
          {sectionsLoading ? (
            <div className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-500">Loading sections...</div>
          ) : (
            <div className="relative">
              <select
                value={selectedSectionId}
                onChange={(e) => {
                  setSelectedSectionId(e.target.value);
                  setSaved(false);
                }}
                className="w-full appearance-none px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
              >
                <option value="">-- Select a section --</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name} ({section.student_count || 0} students)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* Saved Alert */}
      {saved && (
        <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-lg text-sm">
          ✓ Attendance saved successfully
        </div>
      )}

      {!selectedSectionId && !sectionsLoading && (
        <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded-lg text-sm">
          ⚠ Please select a section to begin marking attendance
        </div>
      )}

      {/* Students List */}
      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {students.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No students enrolled</p>
        ) : (
          students.map((student) => {
            const rec = attendance.get(student.id) || { student_id: student.id, status: 'present' };
            return (
              <div
                key={student.id}
                className="bg-white p-4 rounded-lg border border-slate-200 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">{student.full_name}</p>
                    <p className="text-sm text-slate-500 truncate">{student.email}</p>
                  </div>

                  {/* Status Buttons */}
                  <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                    {(['present', 'absent', 'late', 'excused'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => updateAttendance(student.id, status)}
                        className={`flex items-center gap-1 px-3 py-2 rounded-md transition-all text-sm font-medium border ${
                          rec.status === status
                            ? statusColors[status]
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {statusIcons[status]}
                        <span className="hidden sm:inline capitalize">{status}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={rec.notes || ''}
                  onChange={(e) => updateNotes(student.id, e.target.value)}
                  className="mt-3 w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>
            );
          })
        )}
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={saveAttendance}
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving...' : 'Save Attendance'}
        </button>
      </div>

      {/* Summary */}
      <div className="mt-6 p-4 bg-white rounded-lg border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['present', 'absent', 'late', 'excused'] as const).map((status) => {
          const count = Array.from(attendance.values()).filter((r) => r.status === status).length;
          return (
            <div key={status} className="text-center">
              <p className="text-sm text-slate-600 capitalize">{status}</p>
              <p className="text-2xl font-bold text-slate-800">{count}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
