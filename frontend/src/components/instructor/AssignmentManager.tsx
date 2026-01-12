import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Chatbot } from '../../types';
import {
    Plus,
    Trash2,
    Send,
    FileText,
    Check,
    Users,
    Clock
} from 'lucide-react';
import { AssignmentSubmissions } from './AssignmentSubmissions';

interface Assignment {
    id: string;
    chatbot_id: string;
    title: string;
    description: string;
    due_date: string;
    status: 'draft' | 'published';
    created_at: string;
}

export function AssignmentManager() {
    const [courses, setCourses] = useState<Chatbot[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Form
    const [showForm, setShowForm] = useState(false);
    const [viewingAssignment, setViewingAssignment] = useState<Assignment | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newDate, setNewDate] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchCourses();
    }, []);

    useEffect(() => {
        const fetchAssignments = async () => {
            try {
                const data = await api.get<{ assignments: Assignment[] }>(`/instructor/assignments/${selectedCourseId}`);
                setAssignments(data.assignments);
            } catch (error) {
                console.error(error);
            }
        };

        if (selectedCourseId) {
            fetchAssignments();
        }
    }, [selectedCourseId]);

    const fetchCourses = async () => {
        try {
            const data = await api.get<{ chatbots: Chatbot[] }>('/chatbots/list');
            setCourses(data.chatbots);
            if (data.chatbots.length > 0) setSelectedCourseId(data.chatbots[0].id);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCreating(true);
        try {
            await api.post('/instructor/assignments/create', {
                chatbot_id: selectedCourseId,
                title: newTitle,
                description: newDesc,
                due_date: newDate
            });
            setShowForm(false);
            setNewTitle('');
            setNewDesc('');
            setNewDate('');
            // Trigger refresh manually or add to state
            const data = await api.get<{ assignments: Assignment[] }>(`/instructor/assignments/${selectedCourseId}`);
            setAssignments(data.assignments);
        } catch {
            alert('Failed to create assignment');
        } finally {
            setIsCreating(false);
        }
    };

    const handlePublish = async (id: string) => {
        try {
            await api.post(`/instructor/assignments/${id}/publish`, {});
            const data = await api.get<{ assignments: Assignment[] }>(`/instructor/assignments/${selectedCourseId}`);
            setAssignments(data.assignments);
        } catch {
            alert('Failed to publish');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        try {
            await api.delete(`/instructor/assignments/${id}`);
            const data = await api.get<{ assignments: Assignment[] }>(`/instructor/assignments/${selectedCourseId}`);
            setAssignments(data.assignments);
        } catch {
            alert('Failed to delete');
        }
    };

    return (
        <div className="h-full flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        Assignment Manager
                    </h1>
                    <select
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        className="px-3 py-1 border rounded-lg bg-white"
                    >
                        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New Assignment
                </button>
            </div>

            {showForm && (
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 animate-in fade-in slide-in-from-top-4">
                    <h3 className="font-bold mb-4">Create New Assignment</h3>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Title</label>
                            <input
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg"
                                placeholder="e.g. Week 4 Research Paper"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Due Date</label>
                            <input
                                type="datetime-local"
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <textarea
                                value={newDesc}
                                onChange={e => setNewDesc(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg h-24"
                                placeholder="Instructions for students..."
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isCreating}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isCreating ? 'Creating...' : 'Create Assignment'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {assignments.map(a => (
                    <div key={a.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg">{a.title}</h3>
                            <span className={`text-xs px-2 py-1 rounded-full ${a.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {a.status}
                            </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{a.description}</p>

                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                            <Clock className="w-4 h-4" />
                            Due: {new Date(a.due_date).toLocaleDateString()}
                        </div>

                        <div className="flex gap-2 pt-2 border-t">
                            {a.status === 'draft' ? (
                                <button
                                    onClick={() => handlePublish(a.id)}
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 text-sm"
                                >
                                    <Send className="w-4 h-4" />
                                    Publish
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setViewingAssignment(a)}
                                        className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm"
                                    >
                                        <Users className="w-4 h-4" />
                                        View Submissions
                                    </button>
                                    <span className="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium flex items-center gap-1">
                                        <Check className="w-4 h-4" />
                                        Published
                                    </span>
                                </>
                            )}
                            <button
                                onClick={() => handleDelete(a.id)}
                                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
                {assignments.length === 0 && !isLoading && (
                    <div className="col-span-full py-12 text-center text-gray-400">
                        No assignments found. Create one above.
                    </div>
                )}
            </div>

            {/* Submission Viewer Modal */}
            {viewingAssignment && (
                <AssignmentSubmissions
                    assignmentId={viewingAssignment.id}
                    assignmentTitle={viewingAssignment.title}
                    onClose={() => setViewingAssignment(null)}
                />
            )}
        </div>
    );
}
