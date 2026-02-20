import React, { useState, useEffect, useCallback } from 'react';
import {
    BookOpen,
    Plus,
    Trash2,
    Edit3,
    AlertCircle,
    CheckCircle,
    Loader2,
    ChevronDown,
    ChevronLeft,
    X,
    Layers,
    Search,
    Save,
    GraduationCap,
    UserPlus,
} from 'lucide-react';
import { api } from '../../lib/api';

// --- Interfaces ---

interface Teacher {
    id: string;
    username: string;
    full_name: string;
    email: string;
}

interface ClassSubject {
    class_subject_id: string;
    class_id: string;
    chatbot_id: string;
    chatbot_name: string;
    greeting?: string;
    created_at?: string;
}

interface TeacherAssignment {
    assignment_id: string;
    teacher_id: string;
    class_subject_id: string;
    section_id?: string;
    section_name?: string;
    teacher_name: string;
    teacher_username: string;
    subject_name: string;
    chatbot_id: string;
    created_at?: string;
}

interface ClassItem {
    id: string;
    name: string;
    description?: string;
    grade_level?: string;
    section_count?: number;
    subject_count?: number;
    created_at?: string;
    // populated on detail view
    subjects?: ClassSubject[];
    teacher_assignments?: TeacherAssignment[];
    sections?: SectionItem[];
}

interface SectionItem {
    id: string;
    class_id?: string;
    class_name?: string;
    name: string;
    student_count?: number;
    created_at?: string;
    schedule?: Record<string, unknown>;
}

interface Chatbot {
    id: string;
    name: string;
}

// --- Component ---

const AdminClassManager: React.FC = () => {
    // State
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [chatbots, setChatbots] = useState<Chatbot[]>([]);

    // Classes state
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [classSearch, setClassSearch] = useState('');
    const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
    const [detailTab, setDetailTab] = useState<'subjects' | 'teachers' | 'sections'>('subjects');

    // Form state - Create Class
    const [showCreateClass, setShowCreateClass] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const [newClassDescription, setNewClassDescription] = useState('');
    const [newClassGradeLevel, setNewClassGradeLevel] = useState('');

    // Form state - Add Subject
    const [showAddSubject, setShowAddSubject] = useState(false);
    const [newSubjectChatbotId, setNewSubjectChatbotId] = useState('');

    // Form state - Assign Teacher
    const [showAssignTeacher, setShowAssignTeacher] = useState(false);
    const [assignTeacherId, setAssignTeacherId] = useState('');
    const [assignSubjectId, setAssignSubjectId] = useState('');
    const [assignSectionId, setAssignSectionId] = useState('');

    // Form state - Create Section
    const [showCreateSection, setShowCreateSection] = useState(false);
    const [newSectionName, setNewSectionName] = useState('');

    // Edit state
    const [editingClassId, setEditingClassId] = useState<string | null>(null);
    const [editClassName, setEditClassName] = useState('');
    const [editClassDescription, setEditClassDescription] = useState('');
    const [editClassGradeLevel, setEditClassGradeLevel] = useState('');

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // --- Data Loading ---

    const loadTeachers = useCallback(async () => {
        try {
            const response = await api.get('/admin/teachers') as { teachers: Teacher[] };
            setTeachers(response.teachers || []);
        } catch (err: unknown) {
            console.error('Failed to load teachers', err);
        }
    }, []);

    const loadChatbots = useCallback(async () => {
        try {
            const response = await api.get('/admin/chatbots') as { chatbots: Chatbot[] };
            setChatbots(response.chatbots || []);
        } catch {
            try {
                const response = await api.get('/chatbots/list') as { chatbots: Chatbot[] };
                setChatbots(response.chatbots || []);
            } catch (err: unknown) {
                console.error('Failed to load chatbots', err);
            }
        }
    }, []);

    const loadClasses = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await api.get('/admin/classes') as { classes: ClassItem[] };
            setClasses(response.classes || []);
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to load classes');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadClassDetail = useCallback(async (classId: string) => {
        setIsLoading(true);
        try {
            const cls = await api.get(`/admin/classes/${classId}`) as ClassItem;
            setSelectedClass(cls);
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to load class details');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // --- Effects ---

    useEffect(() => {
        loadTeachers();
        loadChatbots();
        loadClasses();
    }, [loadTeachers, loadChatbots, loadClasses]);

    // --- Class Actions ---

    const handleCreateClass = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClassName.trim()) { setError('Class name is required'); return; }
        setIsSaving(true);
        setError('');
        try {
            const res = await api.post('/admin/classes', {
                name: newClassName.trim(),
                description: newClassDescription.trim() || undefined,
                grade_level: newClassGradeLevel.trim() || undefined,
            }) as { class_id: string };
            setSuccess('Class created! Now add subjects and assign teachers.');
            setShowCreateClass(false);
            setNewClassName('');
            setNewClassDescription('');
            setNewClassGradeLevel('');
            loadClasses();
            // Auto-navigate to the new class
            loadClassDetail(res.class_id);
            setDetailTab('subjects');
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to create class');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateClass = async (classId: string) => {
        setIsSaving(true);
        setError('');
        try {
            await api.put(`/admin/classes/${classId}`, {
                name: editClassName.trim() || undefined,
                description: editClassDescription.trim() || undefined,
                grade_level: editClassGradeLevel.trim() || undefined,
            });
            setSuccess('Class updated');
            setEditingClassId(null);
            loadClasses();
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to update class');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClass = async (classId: string, className: string) => {
        if (!confirm(`Delete class "${className}"? This will also remove all subjects, teacher assignments, and sections.`)) return;
        setError('');
        try {
            await api.delete(`/admin/classes/${classId}`);
            setSuccess(`Class "${className}" deleted`);
            if (selectedClass?.id === classId) setSelectedClass(null);
            loadClasses();
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to delete class');
        }
    };

    const startEditClass = (cls: ClassItem) => {
        setEditingClassId(cls.id);
        setEditClassName(cls.name);
        setEditClassDescription(cls.description || '');
        setEditClassGradeLevel(cls.grade_level || '');
    };

    // --- Subject Actions ---

    const handleAddSubject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClass || !newSubjectChatbotId) { setError('Select a course bot'); return; }
        setIsSaving(true);
        setError('');
        try {
            await api.post(`/admin/classes/${selectedClass.id}/subjects`, { chatbot_id: newSubjectChatbotId });
            setSuccess('Subject added to class');
            setShowAddSubject(false);
            setNewSubjectChatbotId('');
            loadClassDetail(selectedClass.id);
            loadClasses();
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to add subject');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveSubject = async (csId: string, name: string) => {
        if (!selectedClass || !confirm(`Remove subject "${name}"? This will also remove teacher assignments for this subject.`)) return;
        setError('');
        try {
            await api.delete(`/admin/classes/${selectedClass.id}/subjects/${csId}`);
            setSuccess(`Subject "${name}" removed`);
            loadClassDetail(selectedClass.id);
            loadClasses();
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to remove subject');
        }
    };

    // --- Teacher Assignment Actions ---

    const handleAssignTeacher = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClass || !assignTeacherId || !assignSubjectId) { setError('Select a teacher and subject'); return; }
        setIsSaving(true);
        setError('');
        try {
            await api.post(`/admin/classes/${selectedClass.id}/subjects/${assignSubjectId}/teacher`, {
                teacher_id: assignTeacherId,
                section_id: assignSectionId || undefined
            });
            setSuccess('Teacher assigned');
            setShowAssignTeacher(false);
            setAssignTeacherId('');
            setAssignSubjectId('');
            setAssignSectionId('');
            loadClassDetail(selectedClass.id);
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to assign teacher');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveTeacherAssignment = async (taId: string, teacherName: string, subjectName: string) => {
        if (!selectedClass || !confirm(`Remove ${teacherName} from ${subjectName}?`)) return;
        setError('');
        try {
            await api.delete(`/admin/teacher-assignments/${taId}`);
            setSuccess(`Teacher removed from subject`);
            loadClassDetail(selectedClass.id);
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to remove teacher assignment');
        }
    };

    // --- Section Actions ---

    const handleCreateSection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClass || !newSectionName.trim()) { setError('Section name is required'); return; }
        setIsSaving(true);
        setError('');
        try {
            await api.post('/admin/sections', {
                name: newSectionName.trim(),
                class_id: selectedClass.id,
            });
            setSuccess('Section created');
            setShowCreateSection(false);
            setNewSectionName('');
            loadClassDetail(selectedClass.id);
            loadClasses();
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to create section');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteSection = async (sectionId: string, sectionName: string) => {
        if (!selectedClass || !confirm(`Delete section "${sectionName}"?`)) return;
        setError('');
        try {
            await api.delete(`/admin/sections/${sectionId}`);
            setSuccess(`Section "${sectionName}" deleted`);
            loadClassDetail(selectedClass.id);
            loadClasses();
        } catch (err: unknown) {
            const error = err as { message?: string };
            setError(error.message || 'Failed to delete section');
        }
    };

    // --- Filtering ---

    const filteredClasses = classes.filter(cls =>
        cls.name.toLowerCase().includes(classSearch.toLowerCase()) ||
        (cls.description || '').toLowerCase().includes(classSearch.toLowerCase()) ||
        (cls.grade_level || '').toLowerCase().includes(classSearch.toLowerCase())
    );

    // Available chatbots for adding (exclude already-added)
    const existingChatbotIds = new Set((selectedClass?.subjects || []).map(s => s.chatbot_id));
    const availableChatbots = chatbots.filter(cb => !existingChatbotIds.has(cb.id));

    // --- Render: Class Detail View ---

    if (selectedClass) {
        return (
            <div className="space-y-5">
                {/* Back + Header */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => { setSelectedClass(null); loadClasses(); }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold text-gray-900 truncate">{selectedClass.name}</h2>
                        <div className="flex items-center gap-3 mt-0.5">
                            {selectedClass.grade_level && (
                                <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">{selectedClass.grade_level}</span>
                            )}
                            {selectedClass.description && (
                                <span className="text-xs text-gray-500 truncate">{selectedClass.description}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Alerts */}
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 flex-1">{error}</p>
                        <button onClick={() => setError('')}><X className="w-4 h-4 text-red-400" /></button>
                    </div>
                )}
                {success && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-green-700 flex-1">{success}</p>
                        <button onClick={() => setSuccess('')}><X className="w-4 h-4 text-green-400" /></button>
                    </div>
                )}

                {/* Detail Tabs */}
                <div className="border-b border-gray-200">
                    <div className="flex gap-4">
                        {([
                            { key: 'subjects' as const, label: 'Subjects', icon: BookOpen, count: selectedClass.subjects?.length || 0 },
                            { key: 'teachers' as const, label: 'Teachers', icon: GraduationCap, count: selectedClass.teacher_assignments?.length || 0 },
                            { key: 'sections' as const, label: 'Sections', icon: Layers, count: selectedClass.sections?.length || 0 },
                        ]).map(({ key, label, icon: Icon, count }) => (
                            <button
                                key={key}
                                onClick={() => { setDetailTab(key); setError(''); setSuccess(''); }}
                                className={`pb-3 px-1 font-medium text-sm transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${detailTab === key
                                    ? 'text-[#6366F1] border-[#6366F1]'
                                    : 'text-gray-500 border-transparent hover:text-gray-700'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                                <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{count}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ---- SUBJECTS TAB ---- */}
                {detailTab === 'subjects' && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowAddSubject(true)}
                                className="px-4 py-2 bg-[#6366F1] text-white rounded-lg text-sm font-medium hover:bg-[#4F46E5] transition-colors flex items-center gap-2"
                                disabled={availableChatbots.length === 0}
                            >
                                <Plus className="w-4 h-4" />
                                Add Subject
                            </button>
                        </div>

                        {/* Add Subject Form */}
                        {showAddSubject && (
                            <div className="bg-white rounded-xl shadow-lg border border-[#6366F1]/20 p-4">
                                <form onSubmit={handleAddSubject} className="flex flex-col sm:flex-row items-end gap-3">
                                    <div className="flex-1 relative w-full">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Course Bot</label>
                                        <select
                                            value={newSubjectChatbotId}
                                            onChange={(e) => setNewSubjectChatbotId(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] appearance-none bg-white pr-10"
                                            required
                                        >
                                            <option value="">— Select Course Bot —</option>
                                            {availableChatbots.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-[34px] w-4 h-4 text-gray-400 pointer-events-none" />
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setShowAddSubject(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-[#6366F1] text-white rounded-lg text-sm font-medium hover:bg-[#4F46E5] disabled:opacity-50 flex items-center gap-2">
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                            Add
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Subjects List */}
                        <div className="bg-white rounded-xl shadow">
                            {(selectedClass.subjects || []).length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">No subjects added yet</p>
                                    <button onClick={() => setShowAddSubject(true)} className="mt-3 text-sm text-[#6366F1] hover:underline">
                                        Add your first subject →
                                    </button>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {(selectedClass.subjects || []).map((subject) => (
                                        <div key={subject.class_subject_id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                    <BookOpen className="w-4 h-4 text-indigo-600" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{subject.chatbot_name}</p>
                                                    {subject.greeting && <p className="text-xs text-gray-500 truncate">{subject.greeting}</p>}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveSubject(subject.class_subject_id, subject.chatbot_name)}
                                                className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0 ml-3"
                                                title="Remove subject"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ---- TEACHERS TAB ---- */}
                {detailTab === 'teachers' && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowAssignTeacher(true)}
                                className="px-4 py-2 bg-[#6366F1] text-white rounded-lg text-sm font-medium hover:bg-[#4F46E5] transition-colors flex items-center gap-2"
                                disabled={(selectedClass.subjects || []).length === 0}
                            >
                                <UserPlus className="w-4 h-4" />
                                Assign Teacher
                            </button>
                        </div>

                        {(selectedClass.subjects || []).length === 0 && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-sm text-amber-700">Add subjects to this class first before assigning teachers.</p>
                            </div>
                        )}

                        {/* Assign Teacher Form */}
                        {showAssignTeacher && (
                            <div className="bg-white rounded-xl shadow-lg border border-[#6366F1]/20 p-4">
                                <form onSubmit={handleAssignTeacher} className="space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        <div className="relative">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                                            <select
                                                value={assignSubjectId}
                                                onChange={(e) => setAssignSubjectId(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] appearance-none bg-white pr-10"
                                                required
                                            >
                                                <option value="">— Select Subject —</option>
                                                {(selectedClass.subjects || []).map(s => (
                                                    <option key={s.class_subject_id} value={s.class_subject_id}>{s.chatbot_name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-3 top-[34px] w-4 h-4 text-gray-400 pointer-events-none" />
                                        </div>
                                        <div className="relative">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                                            <select
                                                value={assignTeacherId}
                                                onChange={(e) => setAssignTeacherId(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] appearance-none bg-white pr-10"
                                                required
                                            >
                                                <option value="">— Select Teacher —</option>
                                                {teachers.map(t => (
                                                    <option key={t.id} value={t.id}>{t.full_name || t.username}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-3 top-[34px] w-4 h-4 text-gray-400 pointer-events-none" />
                                        </div>
                                        <div className="relative">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Section (Optional)</label>
                                            <select
                                                value={assignSectionId}
                                                onChange={(e) => setAssignSectionId(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] appearance-none bg-white pr-10"
                                            >
                                                <option value="">— All Sections —</option>
                                                {(selectedClass.sections || []).map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-3 top-[34px] w-4 h-4 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button type="button" onClick={() => setShowAssignTeacher(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-[#6366F1] text-white rounded-lg text-sm font-medium hover:bg-[#4F46E5] disabled:opacity-50 flex items-center gap-2">
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                            Assign
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Teacher Assignments List */}
                        <div className="bg-white rounded-xl shadow">
                            {(selectedClass.teacher_assignments || []).length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">No teachers assigned yet</p>
                                    {(selectedClass.subjects || []).length > 0 && (
                                        <button onClick={() => setShowAssignTeacher(true)} className="mt-3 text-sm text-[#6366F1] hover:underline">
                                            Assign your first teacher →
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {(selectedClass.teacher_assignments || []).map((ta) => (
                                        <div key={ta.assignment_id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                    <GraduationCap className="w-4 h-4 text-emerald-600" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{ta.teacher_name || ta.teacher_username}</p>
                                                    <p className="text-xs text-gray-500">
                                                        Teaches <span className="text-indigo-600 font-medium">{ta.subject_name}</span>
                                                        {ta.section_name && <span className="text-gray-500"> ({ta.section_name})</span>}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveTeacherAssignment(ta.assignment_id, ta.teacher_name, ta.subject_name)}
                                                className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0 ml-3"
                                                title="Remove assignment"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ---- SECTIONS TAB ---- */}
                {detailTab === 'sections' && (
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowCreateSection(true)}
                                className="px-4 py-2 bg-[#6366F1] text-white rounded-lg text-sm font-medium hover:bg-[#4F46E5] transition-colors flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                New Section
                            </button>
                        </div>

                        {/* Create Section Form */}
                        {showCreateSection && (
                            <div className="bg-white rounded-xl shadow-lg border border-[#6366F1]/20 p-4">
                                <form onSubmit={handleCreateSection} className="flex flex-col sm:flex-row items-end gap-3">
                                    <div className="flex-1 w-full">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Section Name</label>
                                        <input
                                            type="text"
                                            value={newSectionName}
                                            onChange={(e) => setNewSectionName(e.target.value)}
                                            placeholder="e.g. Section A"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                                            required
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setShowCreateSection(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                                        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-[#6366F1] text-white rounded-lg text-sm font-medium hover:bg-[#4F46E5] disabled:opacity-50 flex items-center gap-2">
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                            Create
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Sections List */}
                        <div className="bg-white rounded-xl shadow">
                            {(selectedClass.sections || []).length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">No sections created yet</p>
                                    <button onClick={() => setShowCreateSection(true)} className="mt-3 text-sm text-[#6366F1] hover:underline">
                                        Create your first section →
                                    </button>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {(selectedClass.sections || []).map((section) => (
                                        <div key={section.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                    <Layers className="w-4 h-4 text-blue-600" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{section.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {section.student_count ?? 0} students
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteSection(section.id, section.name)}
                                                className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0 ml-3"
                                                title="Delete section"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // --- Render: Classes List View ---

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#6366F1] to-[#4F46E5] rounded-lg flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Class Management</h2>
                        <p className="text-sm text-gray-500 mt-0.5">Create classes, add subjects, assign teachers</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowCreateClass(true)}
                    className="px-4 py-2 bg-[#6366F1] text-white rounded-lg text-sm font-medium hover:bg-[#4F46E5] transition-colors flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    New Class
                </button>
            </div>

            {/* Alerts */}
            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 flex-1">{error}</p>
                    <button onClick={() => setError('')}><X className="w-4 h-4 text-red-400" /></button>
                </div>
            )}
            {success && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-green-700 flex-1">{success}</p>
                    <button onClick={() => setSuccess('')}><X className="w-4 h-4 text-green-400" /></button>
                </div>
            )}

            {/* Create Class Form */}
            {showCreateClass && (
                <div className="bg-white rounded-xl shadow-lg border border-[#6366F1]/20 p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">Create New Class</h3>
                        <button onClick={() => setShowCreateClass(false)}>
                            <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                        </button>
                    </div>
                    <form onSubmit={handleCreateClass} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Class Name *</label>
                                <input
                                    type="text"
                                    value={newClassName}
                                    onChange={(e) => setNewClassName(e.target.value)}
                                    placeholder="e.g. Class 10"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level</label>
                                <input
                                    type="text"
                                    value={newClassGradeLevel}
                                    onChange={(e) => setNewClassGradeLevel(e.target.value)}
                                    placeholder="e.g. Grade 10"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                                value={newClassDescription}
                                onChange={(e) => setNewClassDescription(e.target.value)}
                                placeholder="Optional description..."
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] resize-y"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setShowCreateClass(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-4 py-2 bg-[#6366F1] text-white rounded-lg text-sm font-medium hover:bg-[#4F46E5] transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Create Class
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                    placeholder="Search classes..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                />
            </div>

            {/* Classes List */}
            <div className="bg-white rounded-xl shadow">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-[#6366F1]" />
                    </div>
                ) : filteredClasses.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">
                        <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">{classSearch ? 'No matching classes found' : 'No classes created yet'}</p>
                        {!classSearch && (
                            <button onClick={() => setShowCreateClass(true)} className="mt-3 text-sm text-[#6366F1] hover:underline">
                                Create your first class →
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Class Name</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Grade</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Subjects</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Sections</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredClasses.map((cls) => (
                                        <tr key={cls.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { loadClassDetail(cls.id); setDetailTab('subjects'); }}>
                                            <td className="px-4 py-3">
                                                {editingClassId === cls.id ? (
                                                    <input
                                                        value={editClassName}
                                                        onChange={(e) => setEditClassName(e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="px-2 py-1 border border-[#6366F1] rounded text-sm w-full focus:outline-none focus:ring-1 focus:ring-[#6366F1]"
                                                    />
                                                ) : (
                                                    <>
                                                        <p className="text-sm font-medium text-gray-900">{cls.name}</p>
                                                        {cls.description && <p className="text-xs text-gray-500 mt-0.5">{cls.description}</p>}
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-sm text-gray-600">{cls.grade_level || '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                                                    {cls.subject_count ?? 0}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                                    {cls.section_count ?? 0}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-2">
                                                    {editingClassId === cls.id ? (
                                                        <>
                                                            <button onClick={() => handleUpdateClass(cls.id)} disabled={isSaving} className="text-[#6366F1] hover:text-[#4F46E5] transition-colors" title="Save">
                                                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                            </button>
                                                            <button onClick={() => setEditingClassId(null)} className="text-gray-400 hover:text-gray-600" title="Cancel">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => startEditClass(cls)} className="text-gray-400 hover:text-[#6366F1] transition-colors" title="Edit class">
                                                                <Edit3 className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => handleDeleteClass(cls.id, cls.name)} className="text-gray-400 hover:text-red-600 transition-colors" title="Delete class">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="md:hidden space-y-3 p-4">
                            {filteredClasses.map((cls) => (
                                <div key={cls.id} className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-indigo-300 transition-colors" onClick={() => { loadClassDetail(cls.id); setDetailTab('subjects'); }}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-gray-900 truncate">{cls.name}</p>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                {cls.grade_level && <span className="text-xs text-gray-500">{cls.grade_level}</span>}
                                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                                                    {cls.subject_count ?? 0} subjects
                                                </span>
                                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                                    {cls.section_count ?? 0} sections
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <button onClick={() => startEditClass(cls)} className="text-gray-400 hover:text-[#6366F1]">
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDeleteClass(cls.id, cls.name)} className="text-gray-400 hover:text-red-600">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminClassManager;
