import { useState, useEffect } from 'react';
import { Users, Mail, Phone, BookOpen, Award, MapPin, Clock, Edit2 } from 'lucide-react';
import { api } from '../../lib/api';

interface Teacher {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  phone?: string;
  bio?: string;
  qualifications?: string;
  department?: string;
  office_location?: string;
  office_hours?: string;
  years_experience?: number;
  full_name?: string;
}

export function AdminTeacherManager() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Edit form state
  const [editData, setEditData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    bio: '',
    qualifications: '',
    department: '',
    office_location: '',
    office_hours: '',
    years_experience: ''
  });

  useEffect(() => {
    fetchTeachers();
  }, []);

  const fetchTeachers = async () => {
    try {
      setIsLoading(true);
      const data = await api.get<{ teachers: Teacher[] }>('/admin/teachers');
      setTeachers(data.teachers);
      setError(null);
    } catch (err) {
      setError('Failed to load teachers');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTeacher = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setEditMode(false);
    setEditData({
      first_name: teacher.first_name || '',
      last_name: teacher.last_name || '',
      phone: teacher.phone || '',
      bio: teacher.bio || '',
      qualifications: teacher.qualifications || '',
      department: teacher.department || '',
      office_location: teacher.office_location || '',
      office_hours: teacher.office_hours || '',
      years_experience: teacher.years_experience?.toString() || ''
    });
  };

  const handleSaveProfile = async () => {
    if (!selectedTeacher) return;

    try {
      await api.put(`/admin/teachers/${selectedTeacher.user_id}/profile`, editData);
      setError(null);
      setEditMode(false);
      await fetchTeachers();
      // Re-select the updated teacher
      const updated = teachers.find(t => t.user_id === selectedTeacher.user_id);
      if (updated) setSelectedTeacher(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Users className="w-8 h-8 text-purple-600" />
        <h1 className="text-3xl font-bold text-slate-800">Teacher Management</h1>
        <span className="ml-auto text-sm text-slate-600">Total: {teachers.length} teachers</span>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg border border-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Teachers List */}
        <div className="lg:col-span-1">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Teachers List</h2>
          {isLoading ? (
            <p className="text-slate-500">Loading teachers...</p>
          ) : teachers.length === 0 ? (
            <p className="text-slate-500 text-sm">No teachers found</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {teachers.map((teacher) => (
                <div
                  key={teacher.user_id}
                  onClick={() => handleSelectTeacher(teacher)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedTeacher?.user_id === teacher.user_id
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-white text-slate-800 border border-slate-200 hover:border-purple-400'
                  }`}
                >
                  <p className="font-medium">
                    {teacher.first_name || teacher.last_name 
                      ? `${teacher.first_name} ${teacher.last_name}`.trim()
                      : teacher.full_name || teacher.username}
                  </p>
                  <p className="text-xs opacity-75">{teacher.department || 'No department'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Teacher Details */}
        <div className="lg:col-span-2">
          {selectedTeacher ? (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
              {/* Header */}
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800">
                      {selectedTeacher.first_name && selectedTeacher.last_name
                        ? `${selectedTeacher.first_name} ${selectedTeacher.last_name}`
                        : selectedTeacher.full_name || selectedTeacher.username}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">@{selectedTeacher.username}</p>
                  </div>
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Contact Information */}
              <div className="p-6 border-b border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Contact Information</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase">Email</p>
                      <p className="text-slate-800">{selectedTeacher.email || 'N/A'}</p>
                    </div>
                  </div>
                  {selectedTeacher.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500 uppercase">Phone</p>
                        <p className="text-slate-800">{selectedTeacher.phone}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Professional Information */}
              <div className="p-6 border-b border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Professional Details</h4>
                {!editMode ? (
                  <div className="space-y-3">
                    {selectedTeacher.department && (
                      <div className="flex items-start gap-3">
                        <BookOpen className="w-5 h-5 text-slate-400 mt-1" />
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Department</p>
                          <p className="text-slate-800">{selectedTeacher.department}</p>
                        </div>
                      </div>
                    )}
                    {selectedTeacher.qualifications && (
                      <div className="flex items-start gap-3">
                        <Award className="w-5 h-5 text-slate-400 mt-1" />
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Qualifications</p>
                          <p className="text-slate-800">{selectedTeacher.qualifications}</p>
                        </div>
                      </div>
                    )}
                    {selectedTeacher.years_experience && (
                      <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 text-slate-400 mt-1" />
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Experience</p>
                          <p className="text-slate-800">{selectedTeacher.years_experience} years</p>
                        </div>
                      </div>
                    )}
                    {selectedTeacher.office_location && (
                      <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-slate-400 mt-1" />
                        <div>
                          <p className="text-xs text-slate-500 uppercase">Office Location</p>
                          <p className="text-slate-800">{selectedTeacher.office_location}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="First Name"
                        value={editData.first_name}
                        onChange={(e) => setEditData({ ...editData, first_name: e.target.value })}
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={editData.last_name}
                        onChange={(e) => setEditData({ ...editData, last_name: e.target.value })}
                        className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Phone"
                      value={editData.phone}
                      onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <input
                      type="text"
                      placeholder="Department"
                      value={editData.department}
                      onChange={(e) => setEditData({ ...editData, department: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <input
                      type="text"
                      placeholder="Qualifications"
                      value={editData.qualifications}
                      onChange={(e) => setEditData({ ...editData, qualifications: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <input
                      type="number"
                      placeholder="Years of Experience"
                      value={editData.years_experience}
                      onChange={(e) => setEditData({ ...editData, years_experience: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <textarea
                      placeholder="Bio"
                      value={editData.bio}
                      onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveProfile}
                        className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={() => setEditMode(false)}
                        className="flex-1 px-4 py-2 bg-slate-300 text-slate-700 rounded-lg hover:bg-slate-400 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bio */}
              {selectedTeacher.bio && !editMode && (
                <div className="p-6 border-b border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wide">Bio</h4>
                  <p className="text-slate-700 text-sm leading-relaxed">{selectedTeacher.bio}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white p-12 rounded-lg border border-slate-200 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Select a teacher to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
