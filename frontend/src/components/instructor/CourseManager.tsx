import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import type { Chatbot, Document } from '../../types';
import {
    Plus,
    Trash2,
    Upload,
    FileText,
    Loader2,
    BookOpen
} from 'lucide-react';

export function CourseManager() {
    const [courses, setCourses] = useState<Chatbot[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form inputs
    const [newCourseName, setNewCourseName] = useState('');
    const [newCourseGreeting, setNewCourseGreeting] = useState('Hello! How can I help you today?');
    const [knowledgeRatio, setKnowledgeRatio] = useState(0.5);

    // Selected course for details/upload
    const [selectedCourse, setSelectedCourse] = useState<Chatbot | null>(null);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loadingDocs, setLoadingDocs] = useState(false);

    // Upload state
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);

    const fetchCourses = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await api.get<{ chatbots: Chatbot[] }>('/chatbots/list');
            setCourses(data.chatbots);
            if (data.chatbots.length > 0 && !selectedCourse) {
                // Optionally select first one
            }
        } catch (err) {
            setError('Failed to load courses');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [selectedCourse]);

    useEffect(() => {
        fetchCourses();
    }, [fetchCourses]);

    const fetchDocuments = useCallback(async (chatbotId: string) => {
        try {
            setLoadingDocs(true);
            const data = await api.get<{ documents: Document[] }>(`/chatbots/${chatbotId}/documents`);
            setDocuments(data.documents);
        } catch (err) {
            console.error("Failed to fetch docs", err);
        } finally {
            setLoadingDocs(false);
        }
    }, []);

    useEffect(() => {
        if (selectedCourse) {
            fetchDocuments(selectedCourse.id);
        } else {
            setDocuments([]);
        }
    }, [selectedCourse, fetchDocuments]);

    const handleCreateCourse = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsCreating(true);
            const formData = new FormData();
            formData.append('name', newCourseName);
            formData.append('greeting', newCourseGreeting);
            formData.append('external_knowledge_ratio', knowledgeRatio.toString());

            // Using FormData because the backend expects Form parameters for /create
            // even though it's text data.
            await api.post('/chatbots/create', formData);

            // Reset and refresh
            setNewCourseName('');
            setNewCourseGreeting('Hello! How can I help you today?');
            setKnowledgeRatio(0.5);
            await fetchCourses();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create course');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteCourse = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // prevent selecting the course
        if (!window.confirm('Are you sure? This will delete all course data including documents and vectors.')) return;

        try {
            await api.delete(`/chatbots/${id}`);
            if (selectedCourse?.id === id) setSelectedCourse(null);
            fetchCourses();
        } catch (err) {
            console.error(err);
            alert('Failed to delete course');
        }
    };

    const handleFileUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCourse || !uploadFile) return;

        try {
            setIsUploading(true);
            setUploadStatus('Uploading and Indexing... This may take a minute.');

            const formData = new FormData();
            formData.append('file', uploadFile);

            await api.post(`/chatbots/${selectedCourse.id}/upload`, formData);

            setUploadStatus('Upload Success!');
            setUploadFile(null);
            // Refresh documents list
            fetchDocuments(selectedCourse.id);

            // Clear status after 3s
            setTimeout(() => setUploadStatus(null), 3000);

        } catch (err) {
            setUploadStatus(`Error: ${err instanceof Error ? err.message : 'Upload failed'}`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex h-full gap-6">
            {/* LEFT: Course List & Creation */}
            <div className="w-1/3 flex flex-col gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-indigo-600" />
                        Create New Course
                    </h2>
                    <form onSubmit={handleCreateCourse} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Course Name</label>
                            <input
                                type="text"
                                value={newCourseName}
                                onChange={(e) => setNewCourseName(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. Biology 101"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Welcome Greeting</label>
                            <input
                                type="text"
                                value={newCourseGreeting}
                                onChange={(e) => setNewCourseGreeting(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Hello! Ask me anything about..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                AI Creativity (0 = Strict, 1 = Creative)
                            </label>
                            <input
                                type="range"
                                min="0" max="1" step="0.1"
                                value={knowledgeRatio}
                                onChange={(e) => setKnowledgeRatio(parseFloat(e.target.value))}
                                className="w-full"
                            />
                            <div className="text-right text-xs text-gray-500">{knowledgeRatio}</div>
                        </div>
                        <button
                            type="submit"
                            disabled={isCreating}
                            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Course'}
                        </button>
                        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                    </form>
                </div>

                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <div className="p-4 border-b bg-gray-50">
                        <h3 className="font-semibold text-gray-700">Existing Courses</h3>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-2">
                        {isLoading ? (
                            <div className="p-8 text-center text-gray-500">Loading...</div>
                        ) : courses.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No courses yet.</div>
                        ) : (
                            courses.map(course => (
                                <div
                                    key={course.id}
                                    onClick={() => setSelectedCourse(course)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-colors flex justify-between items-center group
                                        ${selectedCourse?.id === course.id
                                            ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                                            : 'border-transparent hover:bg-gray-50'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                            <BookOpen className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-gray-900">{course.name}</div>
                                            <div className="text-xs text-gray-500">
                                                Created {new Date(course.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteCourse(course.id, e)}
                                        className="p-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete Course"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* RIGHT: Course Details & Upload */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col">
                {selectedCourse ? (
                    <>
                        <div className="flex justify-between items-start mb-6 pb-6 border-b">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">{selectedCourse.name}</h2>
                                <p className="text-gray-500 mt-1">{selectedCourse.greeting}</p>
                            </div>
                            <div className="flex gap-2">
                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium border border-green-200">
                                    Active
                                </span>
                            </div>
                        </div>

                        {/* Upload Section */}
                        <div className="mb-8 p-6 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-center">
                            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                            <h3 className="font-medium text-gray-900 mb-1">Upload Course Material (PDF)</h3>
                            <p className="text-sm text-gray-500 mb-4">Upload textbooks, lecture notes, or syllabi.</p>

                            <form onSubmit={handleFileUpload} className="max-w-md mx-auto">
                                <div className="flex gap-2">
                                    <input
                                        type="file"
                                        accept=".pdf"
                                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                                        className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!uploadFile || isUploading}
                                        className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {isUploading ? 'Uploading...' : 'Upload'}
                                    </button>
                                </div>
                                {uploadStatus && (
                                    <p className={`mt-3 text-sm ${uploadStatus.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                                        {uploadStatus}
                                    </p>
                                )}
                            </form>
                        </div>

                        {/* Documents List */}
                        <div>
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-gray-500" />
                                Uploaded Documents
                            </h3>
                            {loadingDocs ? (
                                <div className="text-gray-500 text-sm">Loading documents...</div>
                            ) : documents.length === 0 ? (
                                <div className="text-gray-400 italic text-sm">No documents uploaded yet.</div>
                            ) : (
                                <div className="space-y-2">
                                    {documents.map((doc, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-white rounded border">
                                                    <FileText className="w-4 h-4 text-red-500" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-gray-900 text-sm">{doc.filename}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {doc.chunk_count} chunks • {new Date(doc.upload_date).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Could add delete doc button here later */}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <BookOpen className="w-16 h-16 mb-4 opacity-20" />
                        <p>Select a course to manage content</p>
                    </div>
                )}
            </div>
        </div>
    );
}
