import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Users,
  BarChart3,
  Plus,
  Edit2,
  Trash2,
  Search,
  AlertCircle,
  CheckCircle,
  Loader2,
  Eye,
} from 'lucide-react';
import { api } from '../../lib/api';

interface InstitutionsResponse {
  institutions: Institution[];
}

interface UsersResponse {
  users: User[];
  total: number;
}

interface AnalyticsResponse {
  total_institutions: number;
  active_institutions: number;
  total_users: number;
  users_by_role: Record<string, number>;
  institutions_by_status: Record<string, number>;
}

interface Institution {
  id: string;
  name: string;
  code: string;
  domain?: string;
  is_active: boolean;
  created_at: string;
  contact_email?: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  institution_id?: string;
  is_email_verified: boolean;
  created_at: string;
}

interface Analytics {
  total_institutions: number;
  active_institutions: number;
  total_users: number;
  users_by_role: Record<string, number>;
  institutions_by_status: Record<string, number>;
}

type TabType = 'overview' | 'institutions' | 'users' | 'analytics';

const SuperAdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Search and filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  
  // Modal states
  const [showNewInstitution, setShowNewInstitution] = useState(false);
  const [newInstitution, setNewInstitution] = useState({
    name: '',
    code: '',
    domain: '',
    contact_email: '',
  });
  
  const [editingInstitution, setEditingInstitution] = useState<Institution | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      if (activeTab === 'institutions') {
        const response = await api.get('/super_admin/institutions') as InstitutionsResponse;
        setInstitutions(response.institutions || []);
      } else if (activeTab === 'users') {
        const params = new URLSearchParams();
        if (filterRole !== 'all') params.append('role', filterRole);
        if (searchTerm) params.append('search', searchTerm);
        const queryString = params.toString();
        const endpoint = `/super_admin/users${queryString ? `?${queryString}` : ''}`;
        const response = await api.get(endpoint) as UsersResponse;
        setUsers(response.users || []);
      } else if (activeTab === 'analytics') {
        const response = await api.get('/super_admin/analytics/overview') as AnalyticsResponse;
        setAnalytics(response);
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, filterRole, searchTerm]);

  // Load data on component mount and tab change
  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newInstitution.name || !newInstitution.code) {
      setError('Institution name and code are required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await api.post('/super_admin/institutions', newInstitution);
      setSuccess('Institution created successfully');
      setNewInstitution({ name: '', code: '', domain: '', contact_email: '' });
      setShowNewInstitution(false);
      await loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to create institution');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingInstitution) return;

    setIsLoading(true);
    setError('');

    try {
      await api.put(`/super_admin/institutions/${editingInstitution.id}`, {
        name: editingInstitution.name,
        code: editingInstitution.code,
        domain: editingInstitution.domain,
        contact_email: editingInstitution.contact_email,
        is_active: editingInstitution.is_active,
      });
      setSuccess('Institution updated successfully');
      setShowEditModal(false);
      setEditingInstitution(null);
      await loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to update institution');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteInstitution = async (id: string) => {
    if (!confirm('Are you sure you want to delete this institution?')) return;

    setIsLoading(true);
    setError('');

    try {
      await api.delete(`/super_admin/institutions/${id}`);
      setSuccess('Institution deleted successfully');
      await loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to delete institution');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Super Admin Dashboard</h1>
          <p className="text-gray-600">Manage institutions, users, and system-wide analytics</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-green-700">{success}</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-8 border-b border-gray-200">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-4 px-1 font-medium transition-colors border-b-2 ${
                activeTab === 'overview'
                  ? 'text-[#10B981] border-[#10B981]'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <BarChart3 className="inline w-5 h-5 mr-2" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('institutions')}
              className={`pb-4 px-1 font-medium transition-colors border-b-2 ${
                activeTab === 'institutions'
                  ? 'text-[#10B981] border-[#10B981]'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <Building2 className="inline w-5 h-5 mr-2" />
              Institutions
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`pb-4 px-1 font-medium transition-colors border-b-2 ${
                activeTab === 'users'
                  ? 'text-[#10B981] border-[#10B981]'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <Users className="inline w-5 h-5 mr-2" />
              Users
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`pb-4 px-1 font-medium transition-colors border-b-2 ${
                activeTab === 'analytics'
                  ? 'text-[#10B981] border-[#10B981]'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <BarChart3 className="inline w-5 h-5 mr-2" />
              Analytics
            </button>
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {/* Quick Stats */}
              <div className="bg-white rounded-xl shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Total Institutions</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {analytics?.total_institutions || 0}
                    </p>
                  </div>
                  <Building2 className="w-12 h-12 text-[#10B981] opacity-10" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Active Institutions</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {analytics?.active_institutions || 0}
                    </p>
                  </div>
                  <CheckCircle className="w-12 h-12 text-green-500 opacity-10" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Total Users</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {analytics?.total_users || 0}
                    </p>
                  </div>
                  <Users className="w-12 h-12 text-blue-500 opacity-10" />
                </div>
              </div>
            </div>

            {/* Users by Role */}
            {analytics?.users_by_role && (
              <div className="bg-white rounded-xl shadow p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Users by Role</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(analytics.users_by_role).map(([role, count]) => (
                    <div key={role} className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-gray-600 text-sm capitalize">{role}</p>
                      <p className="text-2xl font-bold text-gray-900">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Institutions Tab */}
        {activeTab === 'institutions' && (
          <div>
            <div className="mb-6">
              <button
                onClick={() => setShowNewInstitution(true)}
                className="flex items-center gap-2 px-6 py-3 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors font-medium"
              >
                <Plus className="w-5 h-5" />
                New Institution
              </button>
            </div>

            {/* New Institution Modal */}
            {showNewInstitution && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">Create Institution</h3>
                  
                  <form onSubmit={handleCreateInstitution} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Institution Name
                      </label>
                      <input
                        type="text"
                        value={newInstitution.name}
                        onChange={(e) => setNewInstitution({ ...newInstitution, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                        placeholder="e.g., State University"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Institution Code
                      </label>
                      <input
                        type="text"
                        value={newInstitution.code}
                        onChange={(e) => setNewInstitution({ ...newInstitution, code: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                        placeholder="e.g., SU001"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Domain (Optional)
                      </label>
                      <input
                        type="text"
                        value={newInstitution.domain}
                        onChange={(e) => setNewInstitution({ ...newInstitution, domain: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                        placeholder="e.g., su.edu.in"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Contact Email (Optional)
                      </label>
                      <input
                        type="email"
                        value={newInstitution.contact_email}
                        onChange={(e) => setNewInstitution({ ...newInstitution, contact_email: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                        placeholder="contact@su.edu.in"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="flex-1 py-2 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors disabled:opacity-70"
                      >
                        {isLoading ? 'Creating...' : 'Create'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewInstitution(false)}
                        className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Edit Institution Modal */}
            {showEditModal && editingInstitution && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">Edit Institution</h3>
                  
                  <form onSubmit={handleUpdateInstitution} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Institution Name
                      </label>
                      <input
                        type="text"
                        value={editingInstitution.name}
                        onChange={(e) => setEditingInstitution({ ...editingInstitution, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Institution Code
                      </label>
                      <input
                        type="text"
                        value={editingInstitution.code}
                        onChange={(e) => setEditingInstitution({ ...editingInstitution, code: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Domain (Optional)
                      </label>
                      <input
                        type="text"
                        value={editingInstitution.domain || ''}
                        onChange={(e) => setEditingInstitution({ ...editingInstitution, domain: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Contact Email (Optional)
                      </label>
                      <input
                        type="email"
                        value={editingInstitution.contact_email || ''}
                        onChange={(e) => setEditingInstitution({ ...editingInstitution, contact_email: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editingInstitution.is_active}
                          onChange={(e) => setEditingInstitution({ ...editingInstitution, is_active: e.target.checked })}
                          className="w-4 h-4 text-[#10B981] rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">Active</span>
                      </label>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="flex-1 py-2 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors disabled:opacity-70"
                      >
                        {isLoading ? 'Updating...' : 'Update'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowEditModal(false);
                          setEditingInstitution(null);
                        }}
                        className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Institutions List */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
                </div>
              ) : institutions.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No institutions yet</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Code</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Domain</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {institutions.map((inst) => (
                      <tr key={inst.id} className="border-b hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">{inst.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{inst.code}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{inst.domain || '-'}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            inst.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {inst.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              setEditingInstitution(inst);
                              setShowEditModal(true);
                            }}
                            className="text-[#10B981] hover:text-[#059669] mr-4"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDeleteInstitution(inst.id)}
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
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <div className="mb-6 flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyUp={() => loadData()}
                  placeholder="Search by name, email, or username..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
              </div>
              <select
                value={filterRole}
                onChange={(e) => {
                  setFilterRole(e.target.value);
                  loadData();
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              >
                <option value="all">All Roles</option>
                <option value="student">Students</option>
                <option value="instructor">Instructors</option>
                <option value="admin">Admins</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
                </div>
              ) : users.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No users found</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Verified</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.full_name}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {user.is_email_verified ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-yellow-600" />
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-[#10B981] hover:text-[#059669]">
                            <Eye className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div>
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white rounded-xl shadow p-6">
                    <p className="text-gray-600 text-sm mb-2">Total Institutions</p>
                    <p className="text-4xl font-bold text-gray-900">{analytics?.total_institutions}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow p-6">
                    <p className="text-gray-600 text-sm mb-2">Active Institutions</p>
                    <p className="text-4xl font-bold text-[#10B981]">{analytics?.active_institutions}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow p-6">
                    <p className="text-gray-600 text-sm mb-2">Total Users</p>
                    <p className="text-4xl font-bold text-gray-900">{analytics?.total_users}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow p-6">
                    <p className="text-gray-600 text-sm mb-2">Inactive Institutions</p>
                    <p className="text-4xl font-bold text-red-500">
                      {(analytics?.total_institutions || 0) - (analytics?.active_institutions || 0)}
                    </p>
                  </div>
                </div>

                {analytics?.users_by_role && (
                  <div className="bg-white rounded-xl shadow p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Users by Role</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(analytics.users_by_role).map(([role, count]) => (
                        <div key={role} className="p-4 bg-gradient-to-br from-[#10B981]/10 to-[#059669]/10 rounded-lg border border-[#10B981]/20">
                          <p className="text-gray-600 text-sm capitalize font-medium">{role}</p>
                          <p className="text-3xl font-bold text-[#10B981] mt-2">{count}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
