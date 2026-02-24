import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Brain,
    Plus,
    Trash2,
    Edit3,
    AlertCircle,
    CheckCircle,
    Loader2,
    X,
    Search,
    Save,
    Upload,
    FileText,
    MessageSquare,
    Send,
    Bot,
    User,
    ChevronDown,
    ChevronUp,
    BookOpen,
} from 'lucide-react';
import { api } from '../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// --- Interfaces ---

interface CourseBotItem {
    id: string;
    name: string;
    greeting: string;
    external_knowledge_ratio: number;
    created_at?: string;
}

interface DocumentItem {
    id: number;
    chatbot_id: string;
    filename: string;
    upload_date: string;
    chunk_count: number;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sources?: Array<{
        source: string;
        text: string;
        page?: string;
    }>;
}

type ViewMode = 'list' | 'detail';

// --- Component ---

const AdminCourseManager: React.FC = () => {
    // State
    const [bots, setBots] = useState<CourseBotItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [selectedBot, setSelectedBot] = useState<CourseBotItem | null>(null);
    const [documents, setDocuments] = useState<DocumentItem[]>([]);

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newGreeting, setNewGreeting] = useState('Hello! How can I help you?');
    const [newRatio, setNewRatio] = useState(0.5);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editGreeting, setEditGreeting] = useState('');

    // Upload state
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Chat state
    const [showChat, setShowChat] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatting, setIsChatting] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // --- Data Loading ---

    const loadBots = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await api.get<{ chatbots: CourseBotItem[] }>('/admin/chatbots');
            setBots(response.chatbots || []);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load course bots');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadDocuments = useCallback(async (botId: string) => {
        try {
            const response = await api.get<{ documents: DocumentItem[] }>(`/admin/chatbots/${botId}/documents`);
            setDocuments(response.documents || []);
        } catch (err: unknown) {
            console.error('Failed to load documents:', err);
        }
    }, []);

    useEffect(() => {
        loadBots();
    }, [loadBots]);

    useEffect(() => {
        if (selectedBot) {
            loadDocuments(selectedBot.id);
        }
    }, [selectedBot, loadDocuments]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    // --- Handlers ---

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setIsSaving(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('name', newName.trim());
            formData.append('greeting', newGreeting.trim());
            formData.append('external_knowledge_ratio', String(newRatio));
            await api.post('/admin/chatbots', formData);
            setSuccess('Course bot created successfully');
            setShowCreate(false);
            setNewName('');
            setNewGreeting('Hello! How can I help you?');
            setNewRatio(0.5);
            loadBots();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create course bot');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (botId: string) => {
        setPendingDelete(botId);
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            await api.delete(`/admin/chatbots/${pendingDelete}`);
            setSuccess('Course bot deleted');
            if (selectedBot?.id === pendingDelete) {
                setViewMode('list');
                setSelectedBot(null);
            }
            loadBots();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to delete course bot');
        } finally {
            setIsDeleting(false);
            setPendingDelete(null);
        }
    };

    const handleSaveEdit = async (botId: string) => {
        if (!editName.trim()) return;
        setIsSaving(true);
        try {
            await api.put(`/admin/chatbots/${botId}`, {
                name: editName.trim(),
                greeting: editGreeting.trim(),
            });
            setSuccess('Course bot updated');
            setEditingId(null);
            loadBots();
            if (selectedBot?.id === botId) {
                setSelectedBot({ ...selectedBot, name: editName.trim(), greeting: editGreeting.trim() });
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to update');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length || !selectedBot) return;
        const file = e.target.files[0];
        if (file.type !== 'application/pdf') {
            setError('Only PDF files are supported');
            return;
        }
        setIsUploading(true);
        setUploadProgress(`Uploading "${file.name}"...`);
        setError('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            const result = await api.post<{ message: string; chunks: number }>(`/admin/chatbots/${selectedBot.id}/upload`, formData);
            setSuccess(`"${file.name}" uploaded — ${result.chunks} chunks ingested`);
            setUploadProgress('');
            loadDocuments(selectedBot.id);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Upload failed');
            setUploadProgress('');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleChatSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !selectedBot) return;
        const msg = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
        setIsChatting(true);
        try {
            const response = await api.post<{ response: string; sources: Array<{ source: string; text: string; page?: string }> }>(
                `/chatbots/${selectedBot.id}/chat`,
                { message: msg, top_k: 5 }
            );
            setChatMessages(prev => [...prev, {
                role: 'assistant',
                content: response.response,
                sources: response.sources,
            }]);
        } catch {
            setChatMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Error: Could not get a response. Please check the bot has documents uploaded.',
            }]);
        } finally {
            setIsChatting(false);
        }
    };

    const openBotDetail = (bot: CourseBotItem) => {
        setSelectedBot(bot);
        setViewMode('detail');
        setShowChat(false);
        setChatMessages([]);
    };

    // --- Filter ---
    const filteredBots = bots.filter(b =>
        b.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // --- Auto-clear messages ---
    useEffect(() => {
        if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); }
    }, [success]);
    useEffect(() => {
        if (error) { const t = setTimeout(() => setError(''), 6000); return () => clearTimeout(t); }
    }, [error]);

    // --- Render ---

    return (
        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ConfirmDialog
                isOpen={!!pendingDelete}
                title="Delete Course Bot"
                body="Delete this course bot? All associated documents, quizzes, flashcards, and lesson plans will be permanently removed."
                confirmLabel="Delete Bot"
                isLoading={isDeleting}
                onConfirm={confirmDelete}
                onCancel={() => setPendingDelete(null)}
            />
            {/* Toast Messages */}
            {success && (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 animate-in slide-in-from-top-2">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{success}</p>
                </div>
            )}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 animate-in slide-in-from-top-2">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-xl">
                            <Brain className="w-6 h-6 text-indigo-600" />
                        </div>
                        {viewMode === 'list' ? 'Course Bots' : selectedBot?.name}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {viewMode === 'list'
                            ? `${bots.length} course bot${bots.length !== 1 ? 's' : ''} available`
                            : 'Manage documents & test bot responses'}
                    </p>
                </div>
                <div className="flex gap-3">
                    {viewMode === 'detail' && (
                        <button
                            onClick={() => { setViewMode('list'); setSelectedBot(null); setShowChat(false); }}
                            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            ← Back to List
                        </button>
                    )}
                    {viewMode === 'list' && (
                        <button
                            onClick={() => setShowCreate(!showCreate)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            New Course Bot
                        </button>
                    )}
                </div>
            </div>

            {/* Create Form */}
            {showCreate && viewMode === 'list' && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm animate-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-semibold text-gray-900">Create Course Bot</h3>
                        <button onClick={() => setShowCreate(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Bot Name *</label>
                            <input
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="e.g. Grade 10 Science"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Knowledge Ratio</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={newRatio}
                                    onChange={e => setNewRatio(parseFloat(e.target.value))}
                                    className="flex-1 accent-indigo-600"
                                />
                                <span className="text-sm font-mono text-gray-600 w-10">{newRatio.toFixed(1)}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">0 = strict textbook only, 1 = allow external knowledge</p>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Greeting Message</label>
                            <textarea
                                value={newGreeting}
                                onChange={e => setNewGreeting(e.target.value)}
                                rows={2}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm resize-none"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end mt-5">
                        <button
                            onClick={handleCreate}
                            disabled={!newName.trim() || isSaving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Create Bot
                        </button>
                    </div>
                </div>
            )}

            {/* LIST VIEW */}
            {viewMode === 'list' && (
                <>
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search course bots..."
                            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                        />
                    </div>

                    {/* Bot Grid */}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                        </div>
                    ) : filteredBots.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Brain className="w-8 h-8 text-indigo-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">
                                {searchQuery ? 'No bots match your search' : 'No course bots yet'}
                            </h3>
                            <p className="text-sm text-gray-500 max-w-sm mx-auto">
                                {searchQuery ? 'Try a different search term.' : 'Create your first course bot to start uploading textbook PDFs and powering AI-assisted learning.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredBots.map(bot => (
                                <div
                                    key={bot.id}
                                    className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group"
                                    onClick={() => openBotDetail(bot)}
                                >
                                    {editingId === bot.id ? (
                                        <div onClick={e => e.stopPropagation()} className="space-y-3">
                                            <input
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                                autoFocus
                                            />
                                            <textarea
                                                value={editGreeting}
                                                onChange={e => setEditGreeting(e.target.value)}
                                                rows={2}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleSaveEdit(bot.id)}
                                                    disabled={isSaving}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                                                >
                                                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Brain className="w-5 h-5 text-indigo-600" />
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => { setEditingId(bot.id); setEditName(bot.name); setEditGreeting(bot.greeting || ''); }}
                                                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5 text-gray-500" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(bot.id)}
                                                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                                    </button>
                                                </div>
                                            </div>
                                            <h3 className="font-semibold text-gray-900 text-base mb-1 truncate">{bot.name}</h3>
                                            <p className="text-xs text-gray-500 line-clamp-2 mb-3">{bot.greeting}</p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-400">
                                                    Ratio: {(bot.external_knowledge_ratio * 100).toFixed(0)}%
                                                </span>
                                                {bot.created_at && (
                                                    <span className="text-xs text-gray-400">
                                                        {new Date(bot.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* DETAIL VIEW */}
            {viewMode === 'detail' && selectedBot && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Documents & Upload */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Bot Info Card */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                                        <Brain className="w-6 h-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900">{selectedBot.name}</h2>
                                        <p className="text-sm text-gray-500">{selectedBot.greeting}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium">
                                        Ratio: {(selectedBot.external_knowledge_ratio * 100).toFixed(0)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Upload Section */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                                    <Upload className="w-4 h-4 text-indigo-600" />
                                    Upload Document
                                </h3>
                            </div>
                            <div
                                onClick={() => !isUploading && fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${isUploading
                                    ? 'border-indigo-300 bg-indigo-50'
                                    : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                                    }`}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf"
                                    onChange={handleUpload}
                                    className="hidden"
                                />
                                {isUploading ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                                        <p className="text-sm font-medium text-indigo-700">{uploadProgress}</p>
                                        <p className="text-xs text-gray-500">Processing PDF, extracting text, and generating embeddings...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                                            <Upload className="w-5 h-5 text-gray-400" />
                                        </div>
                                        <p className="text-sm font-medium text-gray-700">Click to upload a PDF</p>
                                        <p className="text-xs text-gray-400">Textbooks, study materials, course content</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Documents List */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
                                <FileText className="w-4 h-4 text-indigo-600" />
                                Documents ({documents.length})
                            </h3>
                            {documents.length === 0 ? (
                                <div className="text-center py-8">
                                    <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-sm text-gray-500">No documents uploaded yet</p>
                                    <p className="text-xs text-gray-400 mt-1">Upload a PDF above to get started</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {documents.map(doc => (
                                        <div
                                            key={doc.id}
                                            className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                                                    <FileText className="w-4 h-4 text-red-500" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-800 truncate max-w-xs">{doc.filename}</p>
                                                    <p className="text-xs text-gray-400">
                                                        {doc.chunk_count} chunks • {new Date(doc.upload_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="px-2 py-1 bg-white border border-gray-200 rounded-md text-xs text-gray-500">
                                                PDF
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Test Chat */}
                    <div className="space-y-4">
                        <button
                            onClick={() => setShowChat(!showChat)}
                            className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-200 hover:border-indigo-200 hover:shadow-sm transition-all"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                                    <MessageSquare className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-sm font-semibold text-gray-900">Test Bot</h3>
                                    <p className="text-xs text-gray-500">Check for hallucinations</p>
                                </div>
                            </div>
                            {showChat ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </button>

                        {showChat && (
                            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col" style={{ height: '500px' }}>
                                {/* Chat Header */}
                                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                                    <Bot className="w-4 h-4 text-emerald-600" />
                                    <span className="text-sm font-medium text-gray-700">{selectedBot.name}</span>
                                    <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                        Test Mode
                                    </span>
                                </div>

                                {/* Chat Messages */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                                    {chatMessages.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-center">
                                            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
                                                <Bot className="w-6 h-6 text-emerald-500" />
                                            </div>
                                            <p className="text-sm font-medium text-gray-700 mb-1">Test this bot</p>
                                            <p className="text-xs text-gray-400 max-w-[200px]">
                                                Ask questions to verify it responds accurately from uploaded materials.
                                            </p>
                                        </div>
                                    ) : (
                                        chatMessages.map((msg, idx) => (
                                            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                                {msg.role === 'assistant' && (
                                                    <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                        <Bot className="w-4 h-4 text-emerald-600" />
                                                    </div>
                                                )}
                                                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === 'user'
                                                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                                                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
                                                    }`}>
                                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                                    {msg.sources && msg.sources.length > 0 && (
                                                        <div className="mt-2 pt-2 border-t border-gray-100">
                                                            <p className="text-[10px] font-semibold text-gray-400 mb-1 uppercase tracking-wide">Sources</p>
                                                            {msg.sources.slice(0, 3).map((s, i) => (
                                                                <div key={i} className="text-[11px] text-gray-500 flex items-center gap-1 mb-0.5">
                                                                    <BookOpen className="w-3 h-3 flex-shrink-0" />
                                                                    <span className="truncate">{s.source} {s.page && `p.${s.page}`}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                {msg.role === 'user' && (
                                                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                        <User className="w-4 h-4 text-gray-500" />
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                    {isChatting && (
                                        <div className="flex gap-3">
                                            <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                                <Bot className="w-4 h-4 text-emerald-600" />
                                            </div>
                                            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                                                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Chat Input */}
                                <div className="p-3 border-t border-gray-100 bg-white">
                                    <form onSubmit={handleChatSend} className="relative">
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={e => setChatInput(e.target.value)}
                                            placeholder="Test a question..."
                                            disabled={isChatting}
                                            className="w-full pl-3 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none disabled:opacity-50"
                                        />
                                        <button
                                            type="submit"
                                            disabled={isChatting || !chatInput.trim()}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                                        >
                                            {isChatting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Quick Actions */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-5">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h4>
                            <div className="space-y-2">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors text-left"
                                >
                                    <Upload className="w-4 h-4 text-indigo-500" />
                                    <span className="text-sm text-gray-700">Upload PDF</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingId(selectedBot.id);
                                        setEditName(selectedBot.name);
                                        setEditGreeting(selectedBot.greeting || '');
                                        setViewMode('list');
                                    }}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors text-left"
                                >
                                    <Edit3 className="w-4 h-4 text-amber-500" />
                                    <span className="text-sm text-gray-700">Edit Bot Settings</span>
                                </button>
                                <button
                                    onClick={() => handleDelete(selectedBot.id)}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-100 hover:bg-red-50 transition-colors text-left"
                                >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                    <span className="text-sm text-red-600">Delete Bot</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminCourseManager;
