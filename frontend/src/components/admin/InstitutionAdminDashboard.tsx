import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  BookOpen,
  FileText,
  BarChart3,
  Plus,
  Edit2,
  Trash2,
  Search,
  AlertCircle,
  CheckCircle,
  Loader2,
  TrendingUp,
  Award,
  Settings,
} from 'lucide-react';
import { api } from '../../lib/api';

interface InstitutionResponse {
  institution: InstitutionData;
  admin_info: InstitutionAdmin;
}

interface MembersResponse {
  members: InstitutionUser[];
}

interface InstitutionData {
  id: string;
  name: string;
  code: string;
  total_users: number;
  total_courses: number;
  total_assignments: number;
}

interface InstitutionAdmin {
  id: string;
  name: string;
  email: string;
}

interface InstitutionUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
}

type TabType = 'overview' | 'members' | 'courses' | 'settings';

const InstitutionAdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [institution, setInstitution] = useState<InstitutionData | null>(null);
  const [members, setMembers] = useState<InstitutionUser[]>([]);
  const [admin, setAdmin] = useState<InstitutionAdmin | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'student' | 'instructor'>('all');

  const loadInstitutionData = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      // Get current user/institution info from API
      const response = await api.get('/admin/institution/info') as InstitutionResponse;
      setInstitution(response.institution);
      setAdmin(response.admin_info);

      // Load members if on members tab
      if (activeTab === 'members') {
        const params = new URLSearchParams();
        if (filterRole !== 'all') params.append('role', filterRole);
        if (searchTerm) params.append('search', searchTerm);
        const queryString = params.toString();
        const endpoint = `/admin/institution/members${queryString ? `?${queryString}` : ''}`;
        const membersResponse = await api.get(endpoint) as MembersResponse;
        setMembers(membersResponse.members || []);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load institution data');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, filterRole, searchTerm]);

  // Load institution data on mount and tab change
  useEffect(() => {
    loadInstitutionData();
  }, [loadInstitutionData]);

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      await api.delete(`/admin/institution/members/${userId}`);
      setSuccess('Member removed successfully');
      await loadInstitutionData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to remove member');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-[#10B981] to-[#059669] rounded-lg flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{institution?.name || 'Institution'}</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Manage your institution's courses, students, and instructors</p>
            </div>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg sm:rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm sm:text-base text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-lg sm:rounded-xl flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm sm:text-base text-green-700">{success}</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-6 sm:mb-8 border-b border-gray-200">
          <div className="flex gap-4 sm:gap-8 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 sm:pb-4 px-1 font-medium text-sm sm:text-base transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'text-[#10B981] border-[#10B981]'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <BarChart3 className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Overview</span>
              <span className="sm:hidden">Stats</span>
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`pb-3 sm:pb-4 px-1 font-medium text-sm sm:text-base transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'members'
                  ? 'text-[#10B981] border-[#10B981]'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <Users className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              Members
            </button>
            <button
              onClick={() => setActiveTab('courses')}
              className={`pb-3 sm:pb-4 px-1 font-medium text-sm sm:text-base transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'courses'
                  ? 'text-[#10B981] border-[#10B981]'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <BookOpen className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              Courses
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`pb-3 sm:pb-4 px-1 font-medium text-sm sm:text-base transition-colors border-b-2 whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'text-[#10B981] border-[#10B981]'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <Settings className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
              Settings
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div>
                {/* Quick Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Total Members</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{institution?.total_users || 0}</p>
                      </div>
                      <Users className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 opacity-10" />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Active Courses</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{institution?.total_courses || 0}</p>
                      </div>
                      <BookOpen className="w-10 h-10 sm:w-12 sm:h-12 text-[#10B981] opacity-10" />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Assignments</p>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{institution?.total_assignments || 0}</p>
                      </div>
                      <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-purple-500 opacity-10" />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Institution Code</p>
                        <p className="text-xl sm:text-2xl font-bold text-gray-900 font-mono mt-1">{institution?.code}</p>
                      </div>
                      <Award className="w-10 h-10 sm:w-12 sm:h-12 text-amber-500 opacity-10" />
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Admin Information</h3>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Name</p>
                        <p className="text-sm sm:text-base text-gray-900 font-medium mt-1">{admin?.name}</p>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600">Email</p>
                        <p className="text-sm sm:text-base text-gray-900 font-medium mt-1">{admin?.email}</p>
                      </div>
                      <button className="mt-4 w-full py-2 sm:py-2.5 border border-[#10B981] text-[#10B981] rounded-lg hover:bg-green-50 transition-colors font-medium text-sm sm:text-base">
                        Edit Profile
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
                    <div className="space-y-2 sm:space-y-3">
                      <button className="w-full py-2.5 sm:py-3 px-3 sm:px-4 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base">
                        <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="hidden sm:inline">Create New Course</span>
                        <span className="sm:hidden">New Course</span>
                      </button>
                      <button className="w-full py-2.5 sm:py-3 px-3 sm:px-4 border border-[#10B981] text-[#10B981] rounded-lg hover:bg-green-50 transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base">
                        <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="hidden sm:inline">Invite Members</span>
                        <span className="sm:hidden">Invite</span>
                      </button>
                      <button className="w-full py-2.5 sm:py-3 px-3 sm:px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base">
                        <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="hidden sm:inline">View Analytics</span>
                        <span className="sm:hidden">Analytics</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
              <div>
                {/* Filters & Search */}
                <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-2 sm:gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyUp={() => loadInstitutionData()}
                      placeholder="Search members..."
                      className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                    />
                  </div>
                  <select
                    value={filterRole}
                    onChange={(e) => {
                      setFilterRole(e.target.value as typeof filterRole);
                      loadInstitutionData();
                    }}
                    className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  >
                    <option value="all">All Roles</option>
                    <option value="student">Students</option>
                    <option value="instructor">Instructors</option>
                  </select>
                  <button className="px-3 sm:px-6 py-2 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors font-medium flex items-center justify-center gap-2 text-sm sm:text-base whitespace-nowrap">
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="hidden sm:inline">Invite</span>
                  </button>
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block bg-white rounded-xl shadow overflow-hidden">
                  {members.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>No members found</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                          <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Joined</th>
                          <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((member) => (
                          <tr key={member.id} className="border-b hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{member.full_name}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{member.email}</td>
                            <td className="px-6 py-4 text-sm">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                                member.role === 'student'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}>
                                {member.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">2024-01-15</td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => handleRemoveMember(member.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                  {members.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 bg-white rounded-lg">
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="text-sm">No members found</p>
                    </div>
                  ) : (
                    members.map((member) => (
                      <div key={member.id} className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900 truncate">{member.full_name}</h3>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{member.email}</p>
                            <div className="mt-2">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                                member.role === 'student'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}>
                                {member.role}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="text-red-500 hover:text-red-700 flex-shrink-0"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Courses Tab */}
            {activeTab === 'courses' && (
              <div>
                <div className="mb-4 sm:mb-6">
                  <button className="flex items-center justify-center sm:justify-start gap-2 w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors font-medium text-sm sm:text-base">
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="hidden sm:inline">Create New Course</span>
                    <span className="sm:hidden">New Course</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {/* Sample Course Card */}
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6 hover:shadow-lg transition-shadow">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#10B981]/10 rounded-lg flex items-center justify-center">
                          <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-[#10B981]" />
                        </div>
                        <div className="flex gap-2">
                          <button className="text-gray-400 hover:text-[#10B981] transition-colors">
                            <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                          <button className="text-gray-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">Course Title {i}</h3>
                      <p className="text-gray-600 text-xs sm:text-sm mb-4">Course description goes here...</p>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          25 students
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          5 assignments
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="w-full">
                <div className="max-w-2xl mx-auto">
                  <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-8">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Institution Settings</h2>

                    <div className="space-y-4 sm:space-y-6">
                      {/* Institution Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Institution Name
                        </label>
                        <input
                          type="text"
                          defaultValue={institution?.name}
                          className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                        />
                      </div>

                      {/* Institution Code */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Institution Code
                        </label>
                        <input
                          type="text"
                          defaultValue={institution?.code}
                          disabled
                          className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm sm:text-base cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 mt-1">Institution code cannot be changed</p>
                      </div>

                      {/* Domain */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Institution Domain
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., institution.edu"
                          className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                        />
                      </div>

                      {/* Contact Email */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Contact Email
                        </label>
                        <input
                          type="email"
                          placeholder="contact@institution.edu"
                          className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                        />
                      </div>

                      {/* Danger Zone */}
                      <div className="pt-4 sm:pt-6 border-t border-gray-200">
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Danger Zone</h3>
                        <button className="w-full py-2.5 sm:py-3 px-3 sm:px-4 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm sm:text-base">
                          Delete Institution
                        </button>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2">
                        <button className="flex-1 py-2.5 sm:py-3 px-3 sm:px-4 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors font-medium text-sm sm:text-base order-2 sm:order-1">
                          Save Changes
                        </button>
                        <button className="flex-1 py-2.5 sm:py-3 px-3 sm:px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm sm:text-base order-1 sm:order-2">
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default InstitutionAdminDashboard;
