import { useState, useEffect } from 'react';
import { Plus, Trash2, Users, Calendar, Eye } from 'lucide-react';

interface Section {
  id: string;
  name: string;
  chatbot_id: string;
  student_count: number;
  created_at: string;
}

interface Chatbot {
  id: string;
  name: string;
}

function SectionManager() {
  const [sections, setSections] = useState<Section[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [formData, setFormData] = useState({
    chatbot_id: '',
    name: ''
  });

  // Fetch chatbots for selection
  useEffect(() => {
    const fetchChatbots = async () => {
      try {
        const res = await fetch('/chatbots/list', {
          credentials: 'include'
        });
        const data = await res.json();
        setChatbots(data.chatbots || []);
      } catch (error) {
        console.error('Failed to fetch chatbots:', error);
      }
    };

    fetchChatbots();
  }, []);

  // Fetch sections for current teacher
  useEffect(() => {
    const fetchSections = async () => {
      try {
        if (chatbots.length === 0) return;
        const res = await fetch(`/instructor/sections/${chatbots[0].id}`, {
          credentials: 'include'
        });
        const data = await res.json();
        setSections(data.sections || []);
      } catch (error) {
        console.error('Failed to fetch sections:', error);
      }
    };

    if (chatbots.length > 0) fetchSections();
  }, [chatbots]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/instructor/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        credentials: 'include'
      });

      if (res.ok) {
        setFormData({ chatbot_id: '', name: '' });
        setShowForm(false);
        // Refresh sections
        const listRes = await fetch(`/instructor/sections/${formData.chatbot_id}`, {
          credentials: 'include'
        });
        const data = await listRes.json();
        setSections(data.sections || []);
      } else {
        alert('Failed to create section');
      }
    } catch (error) {
      console.error('Error creating section:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Manage Sections</h2>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          New Section
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white p-4 sm:p-6 rounded-lg border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Create New Section</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Course *</label>
              <select
                value={formData.chatbot_id}
                onChange={(e) => setFormData({ ...formData, chatbot_id: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a course...</option>
                {chatbots.map((bot) => (
                  <option key={bot.id} value={bot.id}>{bot.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Section Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., Section A, Morning Class"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
              >
                {loading ? 'Creating...' : 'Create Section'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.length === 0 ? (
          <p className="text-center text-slate-500 col-span-full py-12">No sections yet</p>
        ) : (
          sections.map((section) => (
            <div
              key={section.id}
              className="bg-white p-4 sm:p-5 rounded-lg border border-slate-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-800 flex-1 break-words">{section.name}</h3>
                <button className="ml-2 flex-shrink-0 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{section.student_count} students enrolled</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Created {new Date(section.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              <button className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium text-sm">
                <Eye className="w-4 h-4" />
                Manage
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default SectionManager;
