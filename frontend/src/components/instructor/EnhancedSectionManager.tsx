import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
  Users,
  Plus,
  Upload,
  Trash2,
  AlertCircle,
  Loader2,
  ChevronDown,
  Mail,
  Hash,
  UserCheck,
  X,
  Settings,
} from 'lucide-react';
import { EnrollmentManager } from './EnrollmentManager';

interface EnhancedSectionManagerProps {
  chatbotId?: string;
  onSectionSelect?: (sectionId: string, sectionName?: string) => void;
}

interface Section {
  id: string;
  name: string;
  chatbot_id: string;
  teacher_id: string;
  created_at: string;
  description?: string;
  max_students?: number;
  status?: string;
  students?: EnrolledStudent[];
}

interface EnrolledStudent {
  id: string;
  student_id: string;
  username: string;
  full_name: string;
  email: string;
  enrolled_at: string;
  roll_number?: string;
  department?: string;
  profile_picture_url?: string;
  attendance_percentage?: number;
}

interface AvailableStudent {
  id: string;
  username: string;
  full_name: string;
  email: string;
}

export function EnhancedSectionManager({ onSectionSelect }: EnhancedSectionManagerProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>(
    []
  );
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'sections' | 'enrollments' | 'bulk-enroll' | 'settings'
  >('sections');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null
  );
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionChatbotId, setNewSectionChatbotId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editedSectionName, setEditedSectionName] = useState('');
  const [editedSectionDescription, setEditedSectionDescription] = useState('');

  useEffect(() => {
    fetchSections();
  }, []);

  useEffect(() => {
    if (selectedSection) {
      setEditedSectionName(selectedSection.name);
      setEditedSectionDescription(selectedSection.description || '');
    }
  }, [selectedSection]);

  const fetchSections = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<Section[]>(`/instructor/sections/all`);
      setSections(res || []);
      if (res && res.length > 0) {
        setSelectedSection(res[0]);
        // Students are already loaded in the response
        const students = (res[0].students as unknown as EnrolledStudent[]) || [];
        setEnrolledStudents(students);
      }
    } catch (err) {
      setError(`Failed to fetch sections: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSectionSelect = (section: Section) => {
    setSelectedSection(section);
    // Students are already loaded in the section response
    setEnrolledStudents((section.students as unknown as EnrolledStudent[]) || []);
    setActiveTab('enrollments');
    fetchAvailableStudents(section.id);
    setSelectedStudentId('');
    setStudentSearchQuery('');
    if (onSectionSelect) {
      onSectionSelect(section.id, section.name);
    }
  };

  const fetchAvailableStudents = async (sectionId: string, search?: string) => {
    try {
      setIsLoadingStudents(true);
      const url = new URL(`${window.location.origin}/api/instructor/sections/${sectionId}/available-students`);
      if (search) {
        url.searchParams.append('search', search);
      }
      const res = await api.get<AvailableStudent[]>(
        `/instructor/sections/${sectionId}/available-students${search ? `?search=${search}` : ''}`
      );
      setAvailableStudents(res || []);
    } catch (err) {
      setError(`Failed to fetch available students: ${err}`);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const handleEnrollStudent = async () => {
    if (!selectedSection || !selectedStudentId) {
      setError('Please select a student to enroll');
      return;
    }

    try {
      setIsSaving(true);
      await api.post(`/instructor/sections/${selectedSection.id}/enroll`, {
        student_id: selectedStudentId,
      });

      // Find the enrolled student details
      const enrolledStudent = availableStudents.find((s) => s.id === selectedStudentId);
      if (enrolledStudent) {
        const newEnrolledStudent: EnrolledStudent = {
          id: `enrollment-${enrolledStudent.id}`,
          student_id: enrolledStudent.id,
          username: enrolledStudent.username,
          full_name: enrolledStudent.full_name,
          email: enrolledStudent.email,
          enrolled_at: new Date().toISOString(),
        };
        setEnrolledStudents([...enrolledStudents, newEnrolledStudent]);
      }

      // Refresh available students
      await fetchAvailableStudents(selectedSection.id);
      setSelectedStudentId('');
      setError(null);
    } catch (err) {
      setError(`Failed to enroll student: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStudentSearch = async (query: string) => {
    setStudentSearchQuery(query);
    if (selectedSection) {
      // Debounced search on typing
      if (query.length >= 2 || query.length === 0) {
        await fetchAvailableStudents(selectedSection.id, query || undefined);
      }
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!selectedSection) return;

    try {
      await api.delete(
        `/instructor/sections/${selectedSection.id}/students/${studentId}`
      );
      setEnrolledStudents(
        enrolledStudents.filter((s) => s.student_id !== studentId)
      );
      // Refresh available students
      await fetchAvailableStudents(selectedSection.id);
      setShowDeleteConfirm(null);
    } catch (err) {
      setError(`Failed to remove student: ${err}`);
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    try {
      await api.delete(`/instructor/sections/${sectionId}`);
      setSections(sections.filter((s) => s.id !== sectionId));
      if (selectedSection?.id === sectionId) {
        setSelectedSection(sections[0] || null);
      }
      setShowDeleteConfirm(null);
    } catch (err) {
      setError(`Failed to delete section: ${err}`);
    }
  };

  const handleCreateSection = async () => {
    if (!newSectionName.trim() || !newSectionChatbotId.trim()) {
      setError('Section name and chatbot ID are required');
      return;
    }

    try {
      setIsSaving(true);
      await api.post('/instructor/sections', {
        name: newSectionName,
        chatbot_id: newSectionChatbotId,
      });
      setNewSectionName('');
      setNewSectionChatbotId('');
      setShowCreateSection(false);
      await fetchSections();
      setError(null);
    } catch (err) {
      setError(`Failed to create section: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSection = async () => {
    if (!selectedSection) return;

    try {
      setIsSaving(true);
      await api.put(`/instructor/sections/${selectedSection.id}`, {
        name: editedSectionName || selectedSection.name,
      });
      // Update the selected section with new data
      const updatedSection = {
        ...selectedSection,
        name: editedSectionName || selectedSection.name,
        description: editedSectionDescription || selectedSection.description,
      };
      setSelectedSection(updatedSection);
      setSections(
        sections.map((s) =>
          s.id === selectedSection.id ? updatedSection : s
        )
      );
      setError(null);
    } catch (err) {
      setError(`Failed to update section: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-600 dark:text-red-400 hover:underline mt-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sections Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                Sections
              </h3>
              <span className="text-xs font-semibold px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full">
                {sections.length}
              </span>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-800">
              {isLoading && sections.length === 0 ? (
                <div className="p-4 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400 mx-auto" />
                </div>
              ) : sections.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-600 dark:text-gray-400">
                  No sections yet
                </div>
              ) : (
                sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => handleSectionSelect(section)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                      selectedSection?.id === section.id
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-emerald-600 dark:border-emerald-400'
                        : ''
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                      {section.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {section.chatbot_id}
                    </p>
                  </button>
                ))
              )}
            </div>

            <div className="p-3 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={() => setShowCreateSection(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Section
              </button>
            </div>
          </div>
        </div>

        {/* Create Section Modal */}
        {showCreateSection && (
          <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Create New Section
              </h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Section Name
                  </label>
                  <input
                    type="text"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="e.g. Section A"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                    Chatbot ID
                  </label>
                  <input
                    type="text"
                    value={newSectionChatbotId}
                    onChange={(e) => setNewSectionChatbotId(e.target.value)}
                    placeholder="e.g. chatbot-001"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCreateSection}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </button>
                <button
                  onClick={() => setShowCreateSection(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="lg:col-span-3">
          {!selectedSection ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
              <Users className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-400">
                Select a section to manage
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Section Header */}
              <div className="bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedSection.name}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                      {selectedSection.chatbot_id} • Created{' '}
                      {new Date(selectedSection.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveTab('bulk-enroll')}
                      title="Bulk Enroll"
                      className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 rounded-lg text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Bulk Enroll
                    </button>
                    <button className="p-2 hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-lg transition-colors">
                      <Settings className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    <button
                      onClick={() =>
                        setShowDeleteConfirm(
                          showDeleteConfirm === selectedSection.id
                            ? null
                            : selectedSection.id
                        )
                      }
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </button>
                  </div>
                </div>

                {/* Delete Confirmation */}
                {showDeleteConfirm === selectedSection.id && (
                  <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">
                        Delete this section?
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                        This will remove the section and unenroll all students.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() =>
                            handleDeleteSection(selectedSection.id)
                          }
                          className="text-xs font-semibold px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(null)}
                          className="text-xs font-semibold px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 dark:border-gray-800 flex gap-1 bg-white dark:bg-gray-900 rounded-t-xl">
                {(
                  [
                    { id: 'enrollments', label: 'Enrollments', count: enrolledStudents.length },
                    { id: 'bulk-enroll', label: 'Bulk Enroll' },
                    { id: 'settings', label: 'Settings' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === tab.id
                        ? 'border-emerald-600 dark:border-emerald-400 text-emerald-600 dark:text-emerald-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                    {tab.id === 'enrollments' && tab.count && (
                      <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full">
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))} 
              </div>

              {/* Enrollments Tab */}
              {activeTab === 'enrollments' && (
                <div className="bg-white dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-xl">
                  {/* Enrollment Form Section */}
                  <div className="border-b border-gray-200 dark:border-gray-800 p-6 bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-900/10 dark:to-cyan-900/10">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <Plus className="h-5 w-5" />
                      Enroll Students
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Search & Select Student
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Search by name, email, or username..."
                            value={studentSearchQuery}
                            onChange={(e) => handleStudentSearch(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          />
                          {isLoadingStudents && (
                            <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-gray-400" />
                          )}
                        </div>
                      </div>

                      {availableStudents.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Available Students ({availableStudents.length})
                          </label>
                          <select
                            value={selectedStudentId}
                            onChange={(e) => setSelectedStudentId(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          >
                            <option value="">Select a student...</option>
                            {availableStudents.map((student) => (
                              <option key={student.id} value={student.id}>
                                {student.full_name} ({student.username}) - {student.email}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {availableStudents.length === 0 && !isLoadingStudents && studentSearchQuery === '' && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                          <p className="text-sm text-blue-800 dark:text-blue-200">
                            Type to search for students to enroll
                          </p>
                        </div>
                      )}

                      {availableStudents.length === 0 && !isLoadingStudents && studentSearchQuery !== '' && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <p className="text-sm text-amber-800 dark:text-amber-200">
                            No matching students found
                          </p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={handleEnrollStudent}
                          disabled={!selectedStudentId || isSaving}
                          className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                          Enroll Student
                        </button>
                        <button
                          onClick={() => {
                            setSelectedStudentId('');
                            setStudentSearchQuery('');
                            setAvailableStudents([]);
                          }}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Enrolled Students List */}
                  {enrolledStudents.length === 0 ? (
                    <div className="p-12 text-center">
                      <Users className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                      <p className="text-gray-600 dark:text-gray-400">
                        No students enrolled yet
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                      {enrolledStudents.map((student) => (
                        <div
                          key={student.id}
                          className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                          <button
                            onClick={() =>
                              setExpandedStudent(
                                expandedStudent === student.id ? null : student.id
                              )
                            }
                            className="w-full flex items-start justify-between text-left"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-gray-900 dark:text-white">
                                  {student.full_name}
                                </h4>
                                {student.attendance_percentage &&
                                  student.attendance_percentage >= 75 && (
                                    <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full">
                                      Good Attendance
                                    </span>
                                  )}
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
                                {student.roll_number && (
                                  <div className="flex items-center gap-1">
                                    <Hash className="h-3.5 w-3.5" />
                                    {student.roll_number}
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <Mail className="h-3.5 w-3.5" />
                                  {student.email}
                                </div>
                                {student.attendance_percentage !== undefined && (
                                  <div className="flex items-center gap-1">
                                    <UserCheck className="h-3.5 w-3.5" />
                                    {student.attendance_percentage.toFixed(1)}%
                                    attendance
                                  </div>
                                )}
                              </div>
                            </div>
                            <ChevronDown
                              className={`h-5 w-5 text-gray-400 transition-transform flex-shrink-0 ${
                                expandedStudent === student.id ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {expandedStudent === student.id && (
                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
                              <div className="text-xs text-gray-600 dark:text-gray-400">
                                <span className="font-medium">
                                  Enrolled{' '}
                                  {new Date(student.enrolled_at).toLocaleDateString()}
                                </span>
                              </div>
                              <button
                                onClick={() =>
                                  setShowDeleteConfirm(student.student_id)
                                }
                                className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1"
                              >
                                <X className="h-4 w-4" />
                                Remove
                              </button>

                              {showDeleteConfirm === student.student_id && (
                                <div className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-center justify-center">
                                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 max-w-sm">
                                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                                      Remove Student?
                                    </h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                      {student.full_name} will be unenrolled
                                      from this section.
                                    </p>
                                    <div className="flex gap-3">
                                      <button
                                        onClick={() =>
                                          handleRemoveStudent(student.student_id)
                                        }
                                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
                                      >
                                        Remove
                                      </button>
                                      <button
                                        onClick={() =>
                                          setShowDeleteConfirm(null)
                                        }
                                        className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium rounded-lg transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Bulk Enroll Tab */}
              {activeTab === 'bulk-enroll' && (
                <div className="bg-white dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-xl p-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Upload className="h-5 w-5 text-emerald-600" />
                      Bulk Enroll Students
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Quickly enroll multiple students by pasting IDs or uploading a CSV file. This action updates the section enrollments immediately.
                    </p>
                    {selectedSection && (
                      <EnrollmentManager sectionId={selectedSection.id} sectionName={selectedSection.name} />
                    )}
                  </div>
                </div>
              )}


              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="bg-white dark:bg-gray-900 border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-xl p-6">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                        Section Name
                      </label>
                      <input
                        type="text"
                        value={editedSectionName}
                        onChange={(e) => setEditedSectionName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                        Description
                      </label>
                      <textarea
                        value={editedSectionDescription}
                        onChange={(e) => setEditedSectionDescription(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={handleUpdateSection}
                        disabled={isSaving}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save Changes
                      </button>
                      <button
                        onClick={() => {
                          setEditedSectionName(selectedSection?.name || '');
                          setEditedSectionDescription(
                            selectedSection?.description || ''
                          );
                        }}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
