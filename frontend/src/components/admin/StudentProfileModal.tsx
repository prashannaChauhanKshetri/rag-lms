import React, { useState, useEffect } from 'react';
import { X, Mail, Building2, User, Calendar, BookOpen, BarChart3, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

interface StudentProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  institution: string;
  institution_id: string;
  department?: string;
  enrollment_date: string;
  status: string;
  is_email_verified: boolean;
}

interface AttendanceRecord {
  date: string;
  status: string;
}

interface StudentDetailResponse {
  user: StudentProfile;
  attendance: AttendanceRecord[];
}

interface StudentProfileModalProps {
  studentId: string;
  onClose: () => void;
}

const StudentProfileModal: React.FC<StudentProfileModalProps> = ({ studentId, onClose }) => {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'attendance'>('profile');

  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await api.get(`/super_admin/students/${studentId}`) as StudentDetailResponse;
        setProfile(response.user);
        setAttendance(response.attendance || []);
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string } } };
        setError(error.response?.data?.detail || 'Failed to load student profile');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [studentId]);

  // Calculate attendance statistics
  const attendanceStats = {
    total: attendance.length,
    present: attendance.filter(a => a.status === 'present').length,
    absent: attendance.filter(a => a.status === 'absent').length,
    late: attendance.filter(a => a.status === 'late').length,
    percentage: attendance.length > 0 
      ? Math.round((attendance.filter(a => a.status === 'present').length / attendance.length) * 100)
      : 0
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'suspended':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getAttendanceColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-50 text-green-900';
      case 'absent':
        return 'bg-red-50 text-red-900';
      case 'late':
        return 'bg-yellow-50 text-yellow-900';
      case 'excused':
        return 'bg-blue-50 text-blue-900';
      default:
        return 'bg-gray-50 text-gray-900';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#10B981] to-[#059669] text-white p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Student Profile</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          </div>
        ) : profile ? (
          <div className="p-6 space-y-6">
            {/* Tab Navigation */}
            <div className="flex gap-4 border-b">
              <button
                onClick={() => setActiveTab('profile')}
                className={`pb-4 px-1 font-medium transition-colors border-b-2 ${
                  activeTab === 'profile'
                    ? 'text-[#10B981] border-[#10B981]'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                <User className="inline w-5 h-5 mr-2" />
                Profile
              </button>
              <button
                onClick={() => setActiveTab('attendance')}
                className={`pb-4 px-1 font-medium transition-colors border-b-2 ${
                  activeTab === 'attendance'
                    ? 'text-[#10B981] border-[#10B981]'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                <Calendar className="inline w-5 h-5 mr-2" />
                Attendance ({attendanceStats.total})
              </button>
            </div>

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* Personal Information */}
                <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                  <h3 className="text-lg font-bold text-gray-900">Personal Information</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                      <p className="text-gray-900 font-medium">{profile.first_name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                      <p className="text-gray-900 font-medium">{profile.last_name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Mail className="inline w-4 h-4 mr-1" />
                        Email
                      </label>
                      <p className="text-gray-900 break-all">{profile.email}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <User className="inline w-4 h-4 mr-1" />
                        Username
                      </label>
                      <p className="text-gray-900">@{profile.username}</p>
                    </div>
                  </div>
                </div>

                {/* Institution Information */}
                <div className="bg-blue-50 rounded-xl p-6 space-y-4 border border-blue-200">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    Institution Information
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Institution</label>
                      <p className="text-gray-900 font-medium">{profile.institution}</p>
                    </div>
                    {profile.department && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          <BookOpen className="inline w-4 h-4 mr-1" />
                          Department
                        </label>
                        <p className="text-gray-900">{profile.department}</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Calendar className="inline w-4 h-4 mr-1" />
                        Enrollment Date
                      </label>
                      <p className="text-gray-900">{new Date(profile.enrollment_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(profile.status)}`}>
                        {profile.status.charAt(0).toUpperCase() + profile.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Verification Status */}
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">Email Verification</p>
                    <p className="text-sm text-gray-600">
                      {profile.is_email_verified ? 'Email has been verified' : 'Email pending verification'}
                    </p>
                  </div>
                  <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    profile.is_email_verified 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {profile.is_email_verified ? 'Verified' : 'Pending'}
                  </div>
                </div>
              </div>
            )}

            {/* Attendance Tab */}
            {activeTab === 'attendance' && (
              <div className="space-y-6">
                {/* Attendance Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <p className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Total Classes</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{attendanceStats.total}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <p className="text-green-700 text-xs font-semibold uppercase tracking-wide">Present</p>
                    <p className="text-3xl font-bold text-green-900 mt-1">{attendanceStats.present}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                    <p className="text-red-700 text-xs font-semibold uppercase tracking-wide">Absent</p>
                    <p className="text-3xl font-bold text-red-900 mt-1">{attendanceStats.absent}</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                    <p className="text-yellow-700 text-xs font-semibold uppercase tracking-wide">Late</p>
                    <p className="text-3xl font-bold text-yellow-900 mt-1">{attendanceStats.late}</p>
                  </div>
                </div>

                {/* Attendance Percentage */}
                <div className="bg-gradient-to-r from-[#10B981]/10 to-[#059669]/10 rounded-xl p-6 border border-[#10B981]/20">
                  <div className="flex items-center gap-4">
                    <BarChart3 className="w-10 h-10 text-[#10B981]" />
                    <div>
                      <p className="text-gray-600 text-sm font-medium">Attendance Rate</p>
                      <p className="text-4xl font-bold text-[#10B981]">{attendanceStats.percentage}%</p>
                    </div>
                  </div>
                </div>

                {/* Attendance Records */}
                {attendance.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="font-bold text-gray-900 mb-3">Recent Attendance Records</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {attendance.map((record, idx) => (
                        <div key={idx} className={`p-3 rounded-lg flex items-center justify-between ${getAttendanceColor(record.status)}`}>
                          <span className="text-sm font-medium">
                            {new Date(record.date).toLocaleDateString()}
                          </span>
                          <span className="text-sm font-semibold capitalize">
                            {record.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No attendance records yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default StudentProfileModal;
