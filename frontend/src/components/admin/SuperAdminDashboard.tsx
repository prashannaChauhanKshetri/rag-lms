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

import { ConfirmDialog } from '../shared/ConfirmDialog';
import { Pagination } from '../shared/Pagination';

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
  top_institutions?: Array<{ name: string; student_count: number }>;
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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
  }, [activeTab, filterRole, searchTerm, currentPage]);

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
    setPendingDeleteId(id);
  };

  const confirmDeleteInstitution = async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    setError('');
    try {
      await api.delete(`/super_admin/institutions/${pendingDeleteId}`);
      setSuccess('Institution deleted successfully');
      await loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to delete institution');
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8">
      <ConfirmDialog
        isOpen={!!pendingDeleteId}
        title="Delete Institution"
        body="Delete this institution? This will remove all associated users and data permanently."
        confirmLabel="Delete Institution"
        isLoading={isDeleting}
        onConfirm={confirmDeleteInstitution}
        onCancel={() => setPendingDeleteId(null)}
      />
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
              className={`pb-4 px-1 font-medium transition-colors border-b-2 ${activeTab === 'overview'
                ? 'text-[#10B981] border-[#10B981]'
                : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
            >
              <BarChart3 className="inline w-5 h-5 mr-2" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('institutions')}
              className={`pb-4 px-1 font-medium transition-colors border-b-2 ${activeTab === 'institutions'
                ? 'text-[#10B981] border-[#10B981]'
                : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
            >
              <Building2 className="inline w-5 h-5 mr-2" />
              Institutions
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`pb-4 px-1 font-medium transition-colors border-b-2 ${activeTab === 'users'
                ? 'text-[#10B981] border-[#10B981]'
                : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
            >
              <Users className="inline w-5 h-5 mr-2" />
              Users
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`pb-4 px-1 font-medium transition-colors border-b-2 ${activeTab === 'analytics'
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
          <div className="space-y-6">
            {/* Key Stats - Responsive Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Institutions */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-blue-600 text-sm font-medium">Total Institutions</p>
                    <p className="text-4xl font-bold text-blue-900 mt-2">
                      {analytics?.total_institutions || 0}
                    </p>
                  </div>
                  <Building2 className="w-10 h-10 text-blue-400 opacity-50" />
                </div>
              </div>

              {/* Active Institutions */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-green-600 text-sm font-medium">Active Institutions</p>
                    <p className="text-4xl font-bold text-green-900 mt-2">
                      {analytics?.active_institutions || 0}
                    </p>
                  </div>
                  <CheckCircle className="w-10 h-10 text-green-400 opacity-50" />
                </div>
              </div>

              {/* Total Users */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-purple-600 text-sm font-medium">Total Users</p>
                    <p className="text-4xl font-bold text-purple-900 mt-2">
                      {analytics?.total_users || 0}
                    </p>
                  </div>
                  <Users className="w-10 h-10 text-purple-400 opacity-50" />
                </div>
              </div>

              {/* Email Verified */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-orange-600 text-sm font-medium">Verified Users</p>
                    <p className="text-4xl font-bold text-orange-900 mt-2">
                      {analytics?.users_by_role ?
                        Object.values(analytics.users_by_role).reduce((a, b) => a + b, 0)
                        : 0}
                    </p>
                  </div>
                  <CheckCircle className="w-10 h-10 text-orange-400 opacity-50" />
                </div>
              </div>
            </div>

            {/* Users by Role Breakdown */}
            {analytics?.users_by_role && (
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Users Distribution by Role</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Super Admin */}
                  <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                    <p className="text-red-700 text-xs font-semibold uppercase tracking-wide">Super Admin</p>
                    <p className="text-3xl font-bold text-red-900 mt-2">{analytics.users_by_role.super_admin || 0}</p>
                  </div>

                  {/* Admins */}
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                    <p className="text-orange-700 text-xs font-semibold uppercase tracking-wide">Institution Admins</p>
                    <p className="text-3xl font-bold text-orange-900 mt-2">{analytics.users_by_role.admin || 0}</p>
                  </div>

                  {/* Instructors */}
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                    <p className="text-blue-700 text-xs font-semibold uppercase tracking-wide">Instructors</p>
                    <p className="text-3xl font-bold text-blue-900 mt-2">{analytics.users_by_role.instructor || 0}</p>
                  </div>

                  {/* Students */}
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                    <p className="text-green-700 text-xs font-semibold uppercase tracking-wide">Students</p>
                    <p className="text-3xl font-bold text-green-900 mt-2">{analytics.users_by_role.student || 0}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Top Institutions */}
            {analytics?.top_institutions && analytics.top_institutions.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Top Institutions by Student Count</h3>
                <div className="space-y-3">
                  {analytics.top_institutions.map((inst, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#10B981] text-white rounded-full flex items-center justify-center font-bold text-sm">
                          {idx + 1}
                        </div>
                        <p className="font-medium text-gray-900">{inst.name}</p>
                      </div>
                      <p className="font-bold text-[#10B981] text-lg">{inst.student_count || 0} students</p>
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
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gray-50">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="flex-1 w-full">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          loadData();
                        }}
                        placeholder="Search institutions by name, code, or domain..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setSearchTerm('')}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium whitespace-nowrap"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
                </div>
              ) : institutions.length === 0 ? (
                <div className="p-12 text-center">
                  <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500 font-medium">No institutions found</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Name</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Code</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Domain</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Contact Email</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                          <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {institutions.map((inst) => (
                          <tr key={inst.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{inst.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{inst.code}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{inst.domain || '-'}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs" title={inst.contact_email}>
                              {inst.contact_email || '-'}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-2 ${inst.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-200 text-gray-700'
                                }`}>
                                {inst.is_active ? (
                                  <>
                                    <span className="w-2 h-2 rounded-full bg-green-600"></span>
                                    Active
                                  </>
                                ) : (
                                  <>
                                    <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                                    Inactive
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setEditingInstitution(inst);
                                    setShowEditModal(true);
                                  }}
                                  className="text-[#10B981] hover:text-[#059669] p-2 hover:bg-green-50 rounded transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteInstitution(inst.id)}
                                  className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden divide-y">
                    {institutions.map((inst) => (
                      <div key={inst.id} className="p-4 space-y-3 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{inst.name}</h4>
                            <p className="text-sm text-gray-600">{inst.code}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2 ${inst.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-200 text-gray-700'
                            }`}>
                            {inst.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {inst.domain && (
                          <p className="text-sm text-gray-600"><span className="font-medium">Domain:</span> {inst.domain}</p>
                        )}
                        {inst.contact_email && (
                          <p className="text-sm text-gray-600 truncate"><span className="font-medium">Contact:</span> {inst.contact_email}</p>
                        )}
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => {
                              setEditingInstitution(inst);
                              setShowEditModal(true);
                            }}
                            className="flex-1 text-[#10B981] border border-[#10B981] py-2 rounded-lg hover:bg-green-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <Edit2 className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteInstitution(inst.id)}
                            className="flex-1 text-red-500 border border-red-300 py-2 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Search and Filter Bar */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search Users</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        loadData();
                      }}
                      placeholder="Name, email, or username..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Role</label>
                  <select
                    value={filterRole}
                    onChange={(e) => {
                      setFilterRole(e.target.value);
                      loadData();
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  >
                    <option value="all">All Roles</option>
                    <option value="student">Students</option>
                    <option value="instructor">Instructors</option>
                    <option value="admin">Institution Admins</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Users Table - Responsive */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
                </div>
              ) : users.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No users found</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Name</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Email</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Username</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Role</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Joined</th>
                          <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {users.map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.full_name}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{user.username}</td>
                            <td className="px-6 py-4 text-sm">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${user.role === 'super_admin' ? 'bg-red-100 text-red-800' :
                                user.role === 'admin' ? 'bg-orange-100 text-orange-800' :
                                  user.role === 'instructor' ? 'bg-blue-100 text-blue-800' :
                                    'bg-green-100 text-green-800'
                                }`}>
                                {user.role === 'super_admin' ? 'Super Admin' :
                                  user.role === 'admin' ? 'Inst. Admin' :
                                    user.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {user.is_email_verified ? (
                                <span className="flex items-center gap-2 text-green-700 font-medium">
                                  <CheckCircle className="w-5 h-5" />
                                  Verified
                                </span>
                              ) : (
                                <span className="flex items-center gap-2 text-yellow-700 font-medium">
                                  <AlertCircle className="w-5 h-5" />
                                  Pending
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {new Date(user.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button className="text-[#10B981] hover:text-[#059669] p-2 hover:bg-green-50 rounded transition-colors">
                                <Eye className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden divide-y">
                    {users.map((user) => (
                      <div key={user.id} className="p-4 space-y-3 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-gray-900">{user.full_name}</p>
                            <p className="text-sm text-gray-600">@{user.username}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${user.role === 'super_admin' ? 'bg-red-100 text-red-800' :
                            user.role === 'admin' ? 'bg-orange-100 text-orange-800' :
                              user.role === 'instructor' ? 'bg-blue-100 text-blue-800' :
                                'bg-green-100 text-green-800'
                            }`}>
                            {user.role === 'super_admin' ? 'Super Admin' :
                              user.role === 'admin' ? 'Inst. Admin' :
                                user.role}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>{user.email}</p>
                          <p className="flex items-center gap-2">
                            {user.is_email_verified ? (
                              <>
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="text-green-700 font-medium">Verified</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-4 h-4 text-yellow-600" />
                                <span className="text-yellow-700 font-medium">Pending</span>
                              </>
                            )}
                          </p>
                          <p>Joined: {new Date(user.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Pagination */}
            {users.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-6 py-4">
                <Pagination
                  currentPage={currentPage}
                  totalItems={users.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </div>
        )}
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
