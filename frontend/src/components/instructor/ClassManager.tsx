import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Trash2, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';

interface Class {
  id: string;
  name: string;
  chatbot_id: string;
  description?: string;
  grade_level?: string;
  section_count?: number;
  created_at?: string;
}

interface Section {
  id: string;
  name: string;
  student_count?: number;
}

interface Chatbot {
  id: string;
  name: string;
}

export default function ClassManager() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [showNewSectionForm, setShowNewSectionForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newClassName, setNewClassName] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('');

  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionChatbot, setNewSectionChatbot] = useState('');
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);

  const fetchClasses = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<{ classes: Class[] }>('/instructor/classes');
      setClasses(data.classes || []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch classes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSections = useCallback(async () => {
    if (!selectedClassId) return;
    try {
      const data = await api.get<{ sections: Section[] }>(`/instructor/classes/${selectedClassId}`);
      setSections(data.sections || []);
    } catch (err) {
      console.error('Failed to fetch sections:', err);
      setSections([]);
    }
  }, [selectedClassId]);

  const fetchChatbots = useCallback(async () => {
    try {
      const data = await api.get<{ chatbots: Chatbot[] }>('/chatbots/list');
      setChatbots(data.chatbots);
      if (data.chatbots.length === 0) {
        setError('No courses available. Create a course in Course Manager first.');
      } else {
        setError(null);
      }
    } catch (err) {
      setError('Could not load courses. Please try refreshing the page.');
      console.error('Failed to fetch courses:', err);
    }
  }, []);

  // Fetch classes on mount
  useEffect(() => {
    fetchClasses();
    fetchChatbots();
  }, [fetchClasses, fetchChatbots]);

  // Fetch sections when class is selected
  useEffect(() => {
    if (selectedClassId) {
      fetchSections();
    }
  }, [selectedClassId, fetchSections]);

  const handleCreateClass = async () => {
    if (!newClassName.trim() || !newSectionChatbot) {
      setError('Class name and course are required');
      return;
    }

    try {
      await api.post('/instructor/classes', {
        chatbot_id: newSectionChatbot,
        name: newClassName,
        description: newClassDescription || undefined,
        grade_level: newClassGrade || undefined
      });

      setNewClassName('');
      setNewClassDescription('');
      setNewClassGrade('');
      setShowNewClassForm(false);
      await fetchClasses();
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
      setError(`Failed to create class: ${errorMsg}`);
      console.error('Create class error:', err);
    }
  };

  const handleCreateSection = async () => {
    if (!newSectionName.trim() || !selectedClassId) {
      setError('Section name and class selection required');
      return;
    }

    try {
      const selectedClass = classes.find(c => c.id === selectedClassId);
      if (!selectedClass) return;

      await api.post('/instructor/sections', {
        chatbot_id: selectedClass.chatbot_id,
        class_id: selectedClassId,
        name: newSectionName
      });

      setNewSectionName('');
      setShowNewSectionForm(false);
      await fetchSections();
      await fetchClasses(); // Refresh to update section count
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create section');
      console.error(err);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!confirm('Delete this class and all its sections?')) return;

    try {
      await api.delete(`/instructor/classes/${classId}`);

      if (selectedClassId === classId) {
        setSelectedClassId(null);
        setSections([]);
      }
      await fetchClasses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete class');
      console.error(err);
    }
  };

  const selectedClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-800">Class Management</h1>
        </div>
        <button
          onClick={() => setShowNewClassForm(!showNewClassForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Class
        </button>
      </div>

      {/* Error/Warning Alert */}
      {error && (
        <div className={`mb-4 p-4 rounded-lg text-sm ${
          error.includes('No courses') 
            ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
            : 'bg-red-100 text-red-800 border border-red-300'
        }`}>
          <p className="font-medium mb-2">{error}</p>
          {error.includes('No courses') && (
            <p className="text-xs opacity-90">
              👉 Go to <strong>Course Manager</strong> tab to create courses first, then return here.
            </p>
          )}
        </div>
      )}

      {/* New Class Form */}
      {showNewClassForm && (
        <div className="mb-6 p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Create New Class</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Class Name (e.g., Class 10-A)"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={newSectionChatbot}
                onChange={(e) => setNewSectionChatbot(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Course --</option>
                {chatbots.length === 0 ? (
                  <option disabled>No courses available</option>
                ) : (
                  chatbots.map((bot) => (
                    <option key={bot.id} value={bot.id}>
                      {bot.name}
                    </option>
                  ))
                )}
              </select>
              {chatbots.length === 0 && (
                <p className="text-sm text-yellow-700 col-span-2">⚠ No courses found. Create a course first.</p>
              )}
            </div>
            <input
              type="text"
              placeholder="Grade Level (e.g., 10th, Senior)"
              value={newClassGrade}
              onChange={(e) => setNewClassGrade(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Description (optional)"
              value={newClassDescription}
              onChange={(e) => setNewClassDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateClass}
                disabled={chatbots.length === 0}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  chatbots.length === 0
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Create Class
              </button>
              <button
                onClick={() => setShowNewClassForm(false)}
                className="px-4 py-2 bg-slate-300 text-slate-700 rounded-lg hover:bg-slate-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Classes List */}
        <div className="lg:col-span-1">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Classes</h2>
          {loading ? (
            <p className="text-slate-500">Loading classes...</p>
          ) : classes.length === 0 ? (
            <p className="text-slate-500 text-sm">No classes yet. Create one to get started.</p>
          ) : (
            <div className="space-y-2">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  onClick={() => setSelectedClassId(cls.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedClassId === cls.id
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white text-slate-800 border border-slate-200 hover:border-blue-400'
                  }`}
                >
                  <p className="font-medium">{cls.name}</p>
                  <p className="text-xs opacity-75">{cls.section_count || 0} sections</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Class Details & Sections */}
        <div className="lg:col-span-2">
          {selectedClass ? (
            <div>
              {/* Class Header */}
              <div className="bg-white p-4 rounded-lg border border-slate-200 mb-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800">{selectedClass.name}</h3>
                    {selectedClass.grade_level && (
                      <p className="text-sm text-slate-600">Grade: {selectedClass.grade_level}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteClass(selectedClass.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                {selectedClass.description && (
                  <p className="text-sm text-slate-600">{selectedClass.description}</p>
                )}
              </div>

              {/* Sections */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-slate-800">Sections</h4>
                  <button
                    onClick={() => setShowNewSectionForm(!showNewSectionForm)}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Section
                  </button>
                </div>

                {/* New Section Form */}
                {showNewSectionForm && (
                  <div className="mb-4 p-3 bg-white border border-slate-200 rounded-lg">
                    <input
                      type="text"
                      placeholder="Section Name (e.g., Section A, Section 1)"
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateSection}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => setShowNewSectionForm(false)}
                        className="px-3 py-1 text-sm bg-slate-300 text-slate-700 rounded-lg hover:bg-slate-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Sections Grid */}
                {sections.length === 0 ? (
                  <p className="text-slate-500 text-sm">No sections yet.</p>
                ) : (
                  <div className="space-y-2">
                    {sections.map((section) => (
                      <div
                        key={section.id}
                        className="p-3 bg-white rounded-lg border border-slate-200 hover:shadow-md transition-shadow flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{section.name}</p>
                          <p className="text-xs text-slate-500">{section.student_count || 0} students</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white p-8 rounded-lg border border-slate-200 text-center">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Select a class to view sections</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
