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

    // Mobile toggle
    const [showCourseList, setShowCourseList] = useState(true);

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
        <div className="flex flex-col lg:flex-row h-full gap-4 sm:gap-6">
            {/* LEFT: Course List & Creation */}
            <div className="w-full lg:w-1/3 flex flex-col gap-4 sm:gap-6">
                {/* Create Course Form */}
                <div className="bg-white p-4 sm:p-6 rounded-lg sm:rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2">
                        <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                        Create Course
                    </h2>
                    <form onSubmit={handleCreateCourse} className="space-y-3 sm:space-y-4">
                        <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Name</label>
                            <input
                                type="text"
                                value={newCourseName}
                                onChange={(e) => setNewCourseName(e.target.value)}
                                className="w-full px-3 sm:px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. Biology 101"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Greeting</label>
                            <input
                                type="text"
                                value={newCourseGreeting}
                                onChange={(e) => setNewCourseGreeting(e.target.value)}
                                className="w-full px-3 sm:px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Hello! Ask me anything about..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                                AI Creativity: {knowledgeRatio.toFixed(1)}
                            </label>
                            <input
                                type="range"
                                min="0" max="1" step="0.1"
                                value={knowledgeRatio}
                                onChange={(e) => setKnowledgeRatio(parseFloat(e.target.value))}
                                className="w-full"
                            />
                            <p className="text-xs text-gray-500 mt-1">0 = Strict, 1 = Creative</p>
                        </div>
                        <button
                            type="submit"
                            disabled={isCreating}
                            className="w-full bg-indigo-600 text-white py-2 sm:py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm sm:text-base font-medium"
                        >
                            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Course'}
                        </button>
                        {error && <p className="text-red-500 text-xs sm:text-sm mt-2">{error}</p>}
                    </form>
                </div>

                {/* Course List */}
                <div className="flex-1 bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <button
                        onClick={() => setShowCourseList(!showCourseList)}
                        className="lg:hidden p-4 border-b bg-gray-50 font-semibold text-gray-700 flex items-center justify-between"
                    >
                        <span>My Courses ({courses.length})</span>
                        <span>{showCourseList ? '−' : '+'}</span>
                    </button>
                    <div className="hidden lg:block p-4 border-b bg-gray-50">
                        <h3 className="font-semibold text-gray-700">Existing Courses</h3>
                    </div>
                    {showCourseList && (
                        <div className="overflow-y-auto flex-1 p-2 sm:p-4 space-y-2">
                            {isLoading ? (
                                <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>
                            ) : courses.length === 0 ? (
                                <div className="p-8 text-center text-gray-500 text-sm">No courses yet.</div>
                            ) : (
                                courses.map(course => (
                                    <div
                                        key={course.id}
                                        onClick={() => {
                                            setSelectedCourse(course);
                                            setShowCourseList(false);
                                        }}
                                        className={`p-3 sm:p-4 rounded-lg border cursor-pointer transition-colors flex justify-between items-start sm:items-center group text-sm
                                            ${selectedCourse?.id === course.id
                                                ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                                                : 'border-transparent hover:bg-gray-50'}`}
                                    >
                                        <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                                                <BookOpen className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-gray-900 truncate">{course.name}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    {new Date(course.created_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => handleDeleteCourse(course.id, e)}
                                            className="p-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                            title="Delete Course"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: Course Details & Upload */}
            <div className="w-full lg:flex-1 bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6 flex flex-col">
                {selectedCourse ? (
                    <>
                        <div className="mb-4 sm:mb-6 pb-4 sm:pb-6 border-b">
                            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{selectedCourse.name}</h2>
                            <p className="text-xs sm:text-sm text-gray-500 mt-2">{selectedCourse.greeting}</p>
                            <div className="mt-3 sm:mt-4 flex items-center gap-2">
                                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium border border-green-200">
                                    Active
                                </span>
                            </div>
                        </div>

                        {/* Upload Section */}
                        <div className="mb-6 sm:mb-8 p-4 sm:p-6 bg-gray-50 rounded-lg sm:rounded-xl border border-dashed border-gray-300">
                            <div className="text-center">
                                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2 sm:mb-3" />
                                <h3 className="font-medium text-gray-900 text-sm sm:text-base mb-1">Upload Course Material</h3>
                                <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">PDF files only - textbooks, notes, syllabi</p>

                                <form onSubmit={handleFileUpload} className="max-w-md mx-auto">
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type="file"
                                            accept=".pdf"
                                            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                                            className="flex-1 text-xs sm:text-sm text-gray-500 file:mr-2 sm:file:mr-4 file:py-1.5 sm:file:py-2 file:px-2 sm:file:px-4 file:rounded-full file:border-0 file:text-xs sm:file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!uploadFile || isUploading}
                                            className="px-3 sm:px-4 py-2 bg-indigo-600 text-white text-xs sm:text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium whitespace-nowrap"
                                        >
                                            {isUploading ? '...' : 'Upload'}
                                        </button>
                                    </div>
                                    {uploadStatus && (
                                        <p className={`mt-2 text-xs sm:text-sm ${uploadStatus.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                                            {uploadStatus}
                                        </p>
                                    )}
                                </form>
                            </div>
                        </div>

                        {/* Documents List */}
                        <div>
                            <h3 className="font-bold text-gray-900 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
                                Documents
                            </h3>
                            {loadingDocs ? (
                                <div className="text-gray-500 text-xs sm:text-sm">Loading...</div>
                            ) : documents.length === 0 ? (
                                <div className="text-gray-400 italic text-xs sm:text-sm">No documents uploaded yet.</div>
                            ) : (
                                <div className="space-y-2">
                                    {documents.map((doc, idx) => (
                                        <div key={idx} className="flex items-start sm:items-center justify-between p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors gap-2">
                                            <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                                <div className="p-1.5 sm:p-2 bg-white rounded border flex-shrink-0">
                                                    <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-gray-900 text-xs sm:text-sm truncate">{doc.filename}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5">
                                                        {doc.chunk_count} chunks • {new Date(doc.upload_date).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                        <BookOpen className="w-12 h-12 sm:w-16 sm:h-16 mb-4 opacity-20" />
                        <p className="text-sm sm:text-base">Select a course to manage content</p>
                    </div>
                )}
            </div>
        </div>
    );
}
