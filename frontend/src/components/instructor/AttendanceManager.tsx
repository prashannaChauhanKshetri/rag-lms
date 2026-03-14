import { useState, useEffect } from 'react';
import { Calendar, Check, X, Clock, FileText, ChevronDown } from 'lucide-react';

interface Student {
  student_id: string;  // Backend returns student_id, not id
  enrollment_id: string;
  full_name: string;
  username: string;
  email: string;
  status?: 'present' | 'absent' | 'late' | 'excused';  // Optional, from attendance records
  notes?: string;  // Optional notes from attendance records
}

interface TeachingUnit {
  section_id: string;
  chatbot_id: string;
  section_name: string;
  class_name: string;
  chatbot_name: string;
}

interface AttendanceRecord {
  student_id: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
}

export default function AttendanceManager({ sectionId: initialSectionId }: { sectionId?: string }) {
  const [selectedUnit, setSelectedUnit] = useState<string>(''); // format: sectionId|chatbotId
  const [units, setUnits] = useState<TeachingUnit[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [unitsLoading, setUnitsLoading] = useState(true);

  // Fetch teaching units
  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const res = await fetch('/instructor/teaching-units', {
          credentials: 'include'
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        const availableUnits = data.units || [];
        setUnits(availableUnits);

        // Auto-select based on initialSectionId or first unit
        if (availableUnits.length > 0) {
          if (initialSectionId) {
            const match = availableUnits.find((u: TeachingUnit) => u.section_id === initialSectionId);
            if (match) {
              setSelectedUnit(`${match.section_id}|${match.chatbot_id}`);
            } else {
              setSelectedUnit(`${availableUnits[0].section_id}|${availableUnits[0].chatbot_id}`);
            }
          } else {
            setSelectedUnit(`${availableUnits[0].section_id}|${availableUnits[0].chatbot_id}`);
          }
        }
      } catch (error) {
        console.error('Failed to fetch teaching units:', error);
      } finally {
        setUnitsLoading(false);
      }
    };

    fetchUnits();
  }, [initialSectionId]);

  // Fetch enrolled students and attendance when unit or date changes
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedUnit) {
        setStudents([]);
        setAttendance(new Map());
        return;
      }

      setLoading(true);
      try {
        const [sectionId, chatbotId] = selectedUnit.split('|');
        // Fetch attendance records (includes student details) for the selected date and chatbot
        const res = await fetch(`/instructor/sections/${sectionId}/attendance?date=${date}&chatbot_id=${chatbotId}`, {
          credentials: 'include'
        });

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data = await res.json();
        console.log('📋 Attendance records received:', data);

        const records: Student[] = data.attendance_records || [];
        setStudents(records);

        // Initialize attendance map with explicit types
        const initialAttendance = new Map<string, AttendanceRecord>();
        records.forEach((s) => {
          // If status is present in response (from DB), use it. Otherwise default to 'present'.
          // The backend returns 'status' and 'notes' fields merged into the student object if a record exists.
          const status: AttendanceRecord['status'] = (s.status as AttendanceRecord['status']) || 'present';
          const notes: string = s.notes || '';

          const record: AttendanceRecord = {
            student_id: s.student_id,
            status: status,
            notes: notes
          };
          initialAttendance.set(s.student_id, record);
        });

        console.log('📊 Initial attendance map:', Array.from(initialAttendance.entries()));
        setAttendance(initialAttendance);
      } catch (error) {
        console.error('Failed to fetch attendance data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedUnit, date]);

  const updateAttendance = (studentId: string, status: 'present' | 'absent' | 'late' | 'excused') => {
    const existing = attendance.get(studentId) || { student_id: studentId, status: 'present' as const };
    // Create a new object to ensure all fields are preserved
    const updated = {
      student_id: studentId,  // Always include student_id
      status: status,
      notes: existing.notes || ''
    };
    console.log(`Updating attendance for ${studentId}:`, updated);
    setAttendance(new Map(attendance.set(studentId, updated)));
    setSaved(false);
  };

  const updateNotes = (studentId: string, notes: string) => {
    const existing = attendance.get(studentId) || { student_id: studentId, status: 'present' as const };
    // Create a new object to ensure all fields are preserved
    const updated = {
      student_id: studentId,  // Always include student_id
      status: existing.status,
      notes: notes
    };
    setAttendance(new Map(attendance.set(studentId, updated)));
  };

  const saveAttendance = async () => {
    if (!selectedUnit) {
      alert('Please select a subject/section');
      return;
    }

    const [sectionId, chatbotId] = selectedUnit.split('|');

    setLoading(true);
    try {
      const payload = {
        date,
        chatbot_id: chatbotId,
        students: Array.from(attendance.values())
      };

      console.log('💾 Saving attendance with payload:', payload);
      console.log('📅 Date:', date);
      console.log('👥 Students data:', payload.students);

      const res = await fetch(`/instructor/sections/${sectionId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const errorText = await res.text();
        console.error('❌ Server error:', errorText);
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
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Subject/Section</label>
          {unitsLoading ? (
            <div className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-500">Loading your subjects...</div>
          ) : (
            <div className="relative">
              <select
                value={selectedUnit}
                onChange={(e) => {
                  setSelectedUnit(e.target.value);
                  setSaved(false);
                }}
                className="w-full appearance-none px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
              >
                <option value="">-- Select a subject and section --</option>
                {units.map((unit) => (
                  <option key={`${unit.section_id}|${unit.chatbot_id}`} value={`${unit.section_id}|${unit.chatbot_id}`}>
                    {unit.class_name} - {unit.section_name} ({unit.chatbot_name})
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

      {!selectedUnit && !unitsLoading && (
        <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded-lg text-sm">
          ⚠ Please select a subject/section to begin marking attendance
        </div>
      )}

      {/* Students List */}
      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {students.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No students enrolled</p>
        ) : (
          students.map((student) => {
            const rec = attendance.get(student.student_id) || { student_id: student.student_id, status: 'present' as const };
            return (
              <div
                key={student.student_id}
                className="bg-white p-4 rounded-lg border border-slate-200 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="font-semibold text-slate-800 truncate text-sm sm:text-base">{student.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{student.email}</p>
                  </div>

                  {/* Status Buttons */}
                  <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                    {(['present', 'absent', 'late', 'excused'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => updateAttendance(student.student_id, status)}
                        className={`flex items-center justify-center gap-1 flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 rounded-md transition-all text-[11px] sm:text-sm font-medium border ${rec.status === status
                          ? statusColors[status]
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                      >
                        <span className="flex-shrink-0">{statusIcons[status]}</span>
                        <span className="capitalize">{status}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={rec.notes || ''}
                  onChange={(e) => updateNotes(student.student_id, e.target.value)}
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
