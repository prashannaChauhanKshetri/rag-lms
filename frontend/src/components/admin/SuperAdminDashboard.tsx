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
import StudentProfileModal from './StudentProfileModal';

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

interface Student {
  id: string;
  user_id: string;
  first_name?: string;
  last_name?: string;
  email: string;
  username: string;
  institution: string;
  institution_id: string;
  department?: string;
  enrollment_date: string;
  status: string;
}

interface StudentListResponse {
  students: Student[];
  total: number;
  limit: number;
  offset: number;
}

type TabType = 'overview' | 'institutions' | 'users' | 'analytics' | 'students';

const SuperAdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;
  
  // Search and filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterInstitution, setFilterInstitution] = useState('all');
  
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
  
  // Student profile modal
  const [showStudentProfile, setShowStudentProfile] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');

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
      } else if (activeTab === 'students') {
        // Load institutions for filter dropdown
        const instResponse = await api.get('/super_admin/institutions') as InstitutionsResponse;
        setInstitutions(instResponse.institutions || []);
        
        // Load students
        const params = new URLSearchParams();
        if (searchTerm) params.append('search', searchTerm);
        if (filterInstitution !== 'all') params.append('institution_id', filterInstitution);
        params.append('limit', String(itemsPerPage));
        params.append('offset', String((currentPage - 1) * itemsPerPage));
        const queryString = params.toString();
        const endpoint = `/super_admin/students${queryString ? `?${queryString}` : ''}`;
        const response = await api.get(endpoint) as StudentListResponse;
        setStudents(response.students || []);
        setTotalItems(response.total || 0);
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
  }, [activeTab, filterRole, filterInstitution, searchTerm, currentPage, itemsPerPage]);

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
            <button
              onClick={() => {
                setActiveTab('students');
                setCurrentPage(1);
              }}
              className={`pb-4 px-1 font-medium transition-colors border-b-2 ${
                activeTab === 'students'
                  ? 'text-[#10B981] border-[#10B981]'
                  : 'text-gray-600 border-transparent hover:text-gray-900'
              }`}
            >
              <Users className="inline w-5 h-5 mr-2" />
              Students
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
                              <span className={`px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-2 ${
                                inst.is_active
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
                          <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ml-2 ${
                            inst.is_active
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
                              <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${
                                user.role === 'super_admin' ? 'bg-red-100 text-red-800' :
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
                          <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${
                            user.role === 'super_admin' ? 'bg-red-100 text-red-800' :
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

        {/* Students Tab */}
        {activeTab === 'students' && (
          <div className="space-y-6">
            {/* Search and Filter Bar */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search Students</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Name or email..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Institution</label>
                  <select
                    value={filterInstitution}
                    onChange={(e) => {
                      setFilterInstitution(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  >
                    <option value="all">All Institutions</option>
                    {institutions.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterInstitution('all');
                      setCurrentPage(1);
                    }}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>

            {/* Students Table - Responsive */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
                </div>
              ) : students.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No students found</p>
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
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Institution</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Department</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Enrollment Date</th>
                          <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                          <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {students.map((student) => (
                          <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {student.first_name} {student.last_name}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">{student.email}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{student.institution}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{student.department || '-'}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {new Date(student.enrollment_date).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                student.status === 'active' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {student.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button 
                                onClick={() => {
                                  setSelectedStudentId(student.id);
                                  setShowStudentProfile(true);
                                }}
                                className="text-[#10B981] hover:text-[#059669]"
                              >
                                <Eye className="w-5 h-5 inline" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden divide-y">
                    {students.map((student) => (
                      <div 
                        key={student.id} 
                        onClick={() => {
                          setSelectedStudentId(student.id);
                          setShowStudentProfile(true);
                        }}
                        className="p-4 space-y-3 hover:bg-green-50 cursor-pointer transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-gray-900">{student.first_name} {student.last_name}</p>
                            <p className="text-sm text-gray-600">{student.email}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            student.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {student.status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          <p><strong>Institution:</strong> {student.institution}</p>
                          {student.department && <p><strong>Department:</strong> {student.department}</p>}
                          <p><strong>Enrolled:</strong> {new Date(student.enrollment_date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-[#10B981] text-sm font-medium pt-2">
                          View Profile →
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  <div className="bg-gray-50 border-t px-6 py-4 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} students
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        Previous
                      </button>
                      <div className="flex items-center gap-2">
                        {Array.from({ length: Math.ceil(totalItems / itemsPerPage) }).map((_, idx) => {
                          const pageNum = idx + 1;
                          return pageNum > currentPage - 2 && pageNum < currentPage + 2 ? (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                                currentPage === pageNum
                                  ? 'bg-[#10B981] text-white'
                                  : 'border border-gray-300 hover:bg-gray-100'
                              }`}
                            >
                              {pageNum}
                            </button>
                          ) : null;
                        })}
                      </div>
                      <button
                        onClick={() => setCurrentPage(Math.min(Math.ceil(totalItems / itemsPerPage), currentPage + 1))}
                        disabled={currentPage >= Math.ceil(totalItems / itemsPerPage)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Student Profile Modal */}
        {showStudentProfile && selectedStudentId && (
          <StudentProfileModal
            studentId={selectedStudentId}
            onClose={() => {
              setShowStudentProfile(false);
              setSelectedStudentId('');
            }}
          />
        )}
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
