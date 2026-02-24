import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  FileText,
  Link2,
  Plus,
  Trash2,
  Download,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  Clock,
  User,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface CourseResource {
  id: string;
  title: string;
  description: string;
  type: 'document' | 'video' | 'link' | 'assignment';
  url?: string;
  file_path?: string;
  uploaded_by: string;
  uploaded_date: string;
  size?: number;
  downloads: number;
  section_id: string;
  section_name: string;
}

interface ResourceFilter {
  searchTerm: string;
  type: 'all' | 'document' | 'video' | 'link' | 'assignment';
  sortBy: 'recent' | 'popular' | 'name';
}

interface TeachingUnit {
  section_id: string;
  section_name: string;
  class_id: string;
  class_name: string;
  chatbot_id: string;
  chatbot_name: string;
}

const CourseResourceLibrary: React.FC = () => {
  const [resources, setResources] = useState<CourseResource[]>([]);
  const [filteredResources, setFilteredResources] = useState<CourseResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [filter, setFilter] = useState<ResourceFilter>({
    searchTerm: '',
    type: 'all',
    sortBy: 'recent',
  });

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [units, setUnits] = useState<TeachingUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<TeachingUnit | null>(null);

  const [uploadData, setUploadData] = useState<{
    title: string;
    description: string;
    type: 'document' | 'video' | 'link' | 'assignment';
    url: string;
    file: File | null;
  }>({
    title: '',
    description: '',
    type: 'document',
    url: '',
    file: null,
  });

  useEffect(() => {
    // Fetch teaching units instead of chatbots
    const fetchUnits = async () => {
      try {
        const data = await api.get<{ units: TeachingUnit[] }>('/instructor/teaching-units');
        setUnits(data.units);
        if (data.units.length > 0) setSelectedUnit(data.units[0]);
      } catch (error) {
        console.error(error);
      }
    };
    fetchUnits();
  }, []);

  const loadResources = useCallback(async () => {
    if (!selectedUnit) return;
    setIsLoading(true);
    setError('');

    try {
      // The backend will filter by explicit sections taught
      const response = await api.get(`/instructor/resources/${selectedUnit.chatbot_id}`) as { resources: CourseResource[] };
      // Filter out sections not equivalent to the specific selected unit
      const unitResources = (response.resources || []).filter(r => r.section_id === selectedUnit.section_id);
      setResources(unitResources);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load resources');
      setResources([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUnit]);

  useEffect(() => {
    if (selectedUnit) loadResources();
  }, [selectedUnit, loadResources]);

  // Apply filters and sorting
  useEffect(() => {
    let result = [...resources];

    // Search
    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(term) ||
          r.description.toLowerCase().includes(term) ||
          (r.section_name && r.section_name.toLowerCase().includes(term))
      );
    }

    // Type filter
    if (filter.type !== 'all') {
      result = result.filter((r) => r.type === filter.type);
    }

    // Sorting
    result.sort((a, b) => {
      switch (filter.sortBy) {
        case 'popular':
          return b.downloads - a.downloads;
        case 'name':
          return a.title.localeCompare(b.title);
        case 'recent':
        default:
          return new Date(b.uploaded_date).getTime() - new Date(a.uploaded_date).getTime();
      }
    });

    setFilteredResources(result);
  }, [resources, filter]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadData.title) {
      setError('Please enter a title');
      return;
    }

    if (uploadData.type === 'document' && !uploadData.file) {
      setError('Please select a file');
      return;
    }

    if ((uploadData.type === 'link' || uploadData.type === 'video') && !uploadData.url) {
      setError('Please enter a URL');
      return;
    }

    if (!selectedUnit) return;

    try {
      if (uploadData.type === 'document') {
        const formData = new FormData();
        formData.append('title', uploadData.title);
        formData.append('description', uploadData.description);
        formData.append('chatbot_id', selectedUnit.chatbot_id);
        formData.append('section_id', selectedUnit.section_id);
        if (uploadData.file) {
          formData.append('file', uploadData.file);
        }
        await api.post('/instructor/resources/upload', formData);
      } else {
        // Link creation
        await api.post('/instructor/resources/create', {
          chatbot_id: selectedUnit.chatbot_id,
          section_id: selectedUnit.section_id,
          title: uploadData.title,
          url: uploadData.url,
          resource_type: uploadData.type,
        });
      }

      setSuccess('Resource uploaded successfully');
      setShowUploadForm(false);
      setUploadData({ title: '', description: '', type: 'document', url: '', file: null });
      await loadResources();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to upload resource');
    }
  };

  const handleDelete = (id: string) => {
    setPendingDelete(id);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/instructor/resources/${pendingDelete}`);
      setSuccess('Resource deleted successfully');
      await loadResources();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to delete resource');
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'document':
        return <FileText className="w-5 h-5" />;
      case 'video':
        return <Eye className="w-5 h-5" />;
      case 'link':
        return <Link2 className="w-5 h-5" />;
      case 'assignment':
        return <BookOpen className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'document':
        return 'bg-blue-100 text-blue-800';
      case 'video':
        return 'bg-purple-100 text-purple-800';
      case 'link':
        return 'bg-green-100 text-green-800';
      case 'assignment':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };



  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Delete Resource"
        body="Delete this resource? This cannot be undone."
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">Course Resources</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Organize and share course materials with students</p>
            </div>
            <div className="flex items-center gap-4">
              <select
                value={selectedUnit ? `${selectedUnit.chatbot_id}|${selectedUnit.section_id}` : ''}
                onChange={(e) => {
                  const [cbId, secId] = e.target.value.split('|');
                  const unit = units.find(u => u.chatbot_id === cbId && u.section_id === secId);
                  setSelectedUnit(unit || null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 w-full sm:w-auto overflow-hidden text-ellipsis whitespace-nowrap"
              >
                {units.map(u => (
                  <option key={`${u.chatbot_id}|${u.section_id}`} value={`${u.chatbot_id}|${u.section_id}`}>
                    {u.class_name} - {u.section_name} ({u.chatbot_name})
                  </option>
                ))}
              </select>

              <button
                onClick={() => setShowUploadForm(!showUploadForm)}
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base font-medium"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Add Resource</span>
                <span className="sm:hidden">Add</span>
              </button>
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
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm sm:text-base text-green-700">{success}</p>
          </div>
        )}

        {/* Upload Form */}
        {showUploadForm && (
          <div className="bg-white rounded-lg sm:rounded-xl shadow p-6 sm:p-8 mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Upload New Resource</h2>

            <form onSubmit={handleUpload} className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                  <input
                    type="text"
                    value={uploadData.title}
                    onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })}
                    placeholder="e.g., Chapter 5 - Photosynthesis"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={uploadData.description}
                    onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                    placeholder="Add details about this resource..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
                  <select
                    value={uploadData.type}
                    onChange={(e) => setUploadData({ ...uploadData, type: e.target.value as typeof uploadData.type })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="document">Document (PDF, Word, etc)</option>
                    <option value="video">Video Link</option>
                    <option value="link">External Link</option>
                    <option value="assignment">Assignment</option>
                  </select>
                </div>

                {(uploadData.type === 'video' || uploadData.type === 'link') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">URL *</label>
                    <input
                      type="url"
                      value={uploadData.url}
                      onChange={(e) => setUploadData({ ...uploadData, url: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                )}

                {uploadData.type === 'document' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">File *</label>
                    <input
                      type="file"
                      onChange={(e) => setUploadData({ ...uploadData, file: e.target.files?.[0] || null })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowUploadForm(false)}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm sm:text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm sm:text-base"
                >
                  Upload Resource
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-600">Total Resources</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{resources.length}</p>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-600">Total Downloads</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
              {resources.reduce((sum, r) => sum + r.downloads, 0)}
            </p>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
            <p className="text-xs sm:text-sm text-gray-600">Most Popular</p>
            <p className="text-sm font-semibold text-gray-900 mt-1 truncate">
              {resources.sort((a, b) => b.downloads - a.downloads)[0]?.title || '-'}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6 mb-6 sm:mb-8">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={filter.searchTerm}
                  onChange={(e) => setFilter({ ...filter, searchTerm: e.target.value })}
                  placeholder="Search resources..."
                  className="w-full pl-9 pr-3 sm:pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Type</label>
              <select
                value={filter.type}
                onChange={(e) => setFilter({ ...filter, type: e.target.value as typeof filter.type })}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">All Types</option>
                <option value="document">Document</option>
                <option value="video">Video</option>
                <option value="link">Link</option>
                <option value="assignment">Assignment</option>
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Sort By</label>
              <select
                value={filter.sortBy}
                onChange={(e) => setFilter({ ...filter, sortBy: e.target.value as typeof filter.sortBy })}
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="recent">Most Recent</option>
                <option value="popular">Most Popular</option>
                <option value="name">Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Resources */}
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredResources.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-lg">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600">No resources found</p>
              </div>
            ) : (
              filteredResources.map((resource) => (
                <div key={resource.id} className="bg-white rounded-lg p-4 sm:p-6 border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${getTypeColor(resource.type)}`}>
                        {getTypeIcon(resource.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm sm:text-base font-bold text-gray-900 break-words">{resource.title}</h3>
                        <p className="text-xs sm:text-sm text-gray-600 line-clamp-1">{resource.description}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-2">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {resource.uploaded_by}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(resource.uploaded_date).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Download className="w-3 h-3" />
                            {resource.downloads} downloads
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                      {resource.url ? (
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-blue-600 text-xs font-medium hover:text-blue-800"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </a>
                      ) : (
                        <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-blue-600 text-xs font-medium hover:text-blue-800">
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(resource.id)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-red-600 text-xs font-medium hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseResourceLibrary;
