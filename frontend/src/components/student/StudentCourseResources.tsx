import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  FileText,
  Link2,
  Eye,
  Download,
  Search,
  Filter,
  AlertCircle,
  Loader2,
  Clock,
  User,
  Video,
} from 'lucide-react';
import { api } from '../../lib/api';

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
  course_id: string;
  course_name: string;
}

interface FilterState {
  searchTerm: string;
  type: 'all' | 'document' | 'video' | 'link' | 'assignment';
  course: 'all' | string;
  sortBy: 'recent' | 'type' | 'course';
}

const StudentCourseResources: React.FC = () => {
  const [resources, setResources] = useState<CourseResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState<FilterState>({
    searchTerm: '',
    type: 'all',
    course: 'all',
    sortBy: 'recent',
  });

  const [courses, setCourses] = useState<string[]>([]);
  const [expandedResource, setExpandedResource] = useState<string | null>(null);

  const loadResources = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get('/student/resources') as {
        resources: CourseResource[];
      };
      const resourceList = response.resources || [];
      setResources(resourceList);

      // Extract unique courses
      const uniqueCourses = [...new Set(resourceList.map((r) => r.course_name))];
      setCourses(uniqueCourses);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(error.response?.data?.detail || 'Failed to load resources');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  // Filter and sort
  const filteredResources = resources
    .filter((r) => {
      // Search filter
      if (filter.searchTerm) {
        const term = filter.searchTerm.toLowerCase();
        if (
          !r.title.toLowerCase().includes(term) &&
          !r.description.toLowerCase().includes(term) &&
          !r.course_name.toLowerCase().includes(term)
        ) {
          return false;
        }
      }

      // Type filter
      if (filter.type !== 'all' && r.type !== filter.type) {
        return false;
      }

      // Course filter
      if (filter.course !== 'all' && r.course_name !== filter.course) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      switch (filter.sortBy) {
        case 'type':
          return a.type.localeCompare(b.type);
        case 'course':
          return a.course_name.localeCompare(b.course_name);
        case 'recent':
        default:
          return new Date(b.uploaded_date).getTime() - new Date(a.uploaded_date).getTime();
      }
    });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'document':
        return <FileText className="w-5 h-5" />;
      case 'video':
        return <Video className="w-5 h-5" />;
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

  const getTypeLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const stats = {
    totalResources: resources.length,
    byType: {
      document: resources.filter((r) => r.type === 'document').length,
      video: resources.filter((r) => r.type === 'video').length,
      link: resources.filter((r) => r.type === 'link').length,
      assignment: resources.filter((r) => r.type === 'assignment').length,
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="p-3 bg-amber-100 rounded-lg flex-shrink-0">
              <BookOpen className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Course Resources</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">
                Access materials shared by your instructors
              </p>
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

        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <p className="text-xs sm:text-sm text-gray-600">Total Resources</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">{stats.totalResources}</p>
              </div>

              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <p className="text-xs sm:text-sm text-gray-600">Documents</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600 mt-1">{stats.byType.document}</p>
              </div>

              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <p className="text-xs sm:text-sm text-gray-600">Videos</p>
                <p className="text-2xl sm:text-3xl font-bold text-purple-600 mt-1">{stats.byType.video}</p>
              </div>

              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <p className="text-xs sm:text-sm text-gray-600">Links</p>
                <p className="text-2xl sm:text-3xl font-bold text-green-600 mt-1">{stats.byType.link}</p>
              </div>

              <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6">
                <p className="text-xs sm:text-sm text-gray-600">Assignments</p>
                <p className="text-2xl sm:text-3xl font-bold text-orange-600 mt-1">{stats.byType.assignment}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg sm:rounded-xl shadow p-4 sm:p-6 mb-6 sm:mb-8">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Course</label>
                  <select
                    value={filter.course}
                    onChange={(e) => setFilter({ ...filter, course: e.target.value as typeof filter.course })}
                    className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="all">All Courses</option>
                    {courses.map((course) => (
                      <option key={course} value={course}>
                        {course}
                      </option>
                    ))}
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
                    <option value="type">Type</option>
                    <option value="course">Course Name</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Resources */}
            {filteredResources.length === 0 ? (
              <div className="bg-white rounded-lg sm:rounded-xl p-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 text-lg">No resources found</p>
                <p className="text-gray-500 text-sm mt-2">
                  {resources.length === 0
                    ? 'Your instructors haven\'t shared any resources yet.'
                    : 'Try adjusting your filters.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredResources.map((resource) => (
                  <div key={resource.id} className="bg-white rounded-lg sm:rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    <button
                      onClick={() =>
                        setExpandedResource(expandedResource === resource.id ? null : resource.id)
                      }
                      className="w-full text-left p-4 sm:p-6 focus:outline-none"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                        <div className={`p-3 rounded-lg flex-shrink-0 ${getTypeColor(resource.type)}`}>
                          {getTypeIcon(resource.type)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm sm:text-base font-bold text-gray-900 break-words">
                            {resource.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-600 line-clamp-2 mt-1">
                            {resource.description}
                          </p>

                          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
                            <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 rounded">
                              {getTypeLabel(resource.type)}
                            </span>
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />
                              {resource.course_name}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {resource.uploaded_by}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(resource.uploaded_date).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {resource.url ? (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex-shrink-0 px-3 sm:px-4 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 font-medium text-xs sm:text-sm transition-colors flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="hidden sm:inline">View</span>
                          </a>
                        ) : (
                          <button className="flex-shrink-0 px-3 sm:px-4 py-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 font-medium text-xs sm:text-sm transition-colors flex items-center gap-1">
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Download</span>
                          </button>
                        )}
                      </div>
                    </button>

                    {/* Expanded Details */}
                    {expandedResource === resource.id && (
                      <div className="border-t border-gray-200 p-4 sm:p-6 bg-gray-50">
                        <div className="space-y-3">
                          {resource.description && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-2">Description</h4>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{resource.description}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-gray-600">
                            <div>
                              <p className="font-medium">Type</p>
                              <p className="text-gray-900">{getTypeLabel(resource.type)}</p>
                            </div>
                            <div>
                              <p className="font-medium">Course</p>
                              <p className="text-gray-900 break-words">{resource.course_name}</p>
                            </div>
                            <div>
                              <p className="font-medium">Uploaded By</p>
                              <p className="text-gray-900">{resource.uploaded_by}</p>
                            </div>
                            <div>
                              <p className="font-medium">Date</p>
                              <p className="text-gray-900">
                                {new Date(resource.uploaded_date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StudentCourseResources;
