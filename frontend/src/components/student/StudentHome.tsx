import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import {
    BookOpen,
    Atom,
    Globe2,
    Calculator,
    Palette,
    Languages,
    Code,
    Beaker,
    Scale,
    Music,
    Dumbbell,
    History,
    Brain,
    CreditCard,
    MessageSquare,
    CheckSquare,
    Clock,
    TrendingUp,
    BarChart3,
    ChevronRight,
    Sparkles,
    Target,
    Loader2,
    AlertCircle,
    Calendar,
    Users,
    GraduationCap,
    ArrowRight,
    Layers,
    FileText,
    type LucideIcon,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EnrolledSubject {
    section_id: string;
    section_name: string;
    class_name: string;
    chatbot_id: string;
    subject_name: string;
    teacher_name: string;
    attendance_percentage?: number;
    pending_assignments?: number;
}

interface StudentStats {
    total_enrollments: number;
    active_assignments: number;
    completed_assignments: number;
    overall_grade: number;
}

interface ProgressData {
    overall_completion: number;
    overall_average_grade: number;
    total_courses: number;
    total_assignments: number;
    completed_assignments: number;
    courses: CourseProgress[];
}

interface CourseProgress {
    course_id: string;
    course_name: string;
    total_assignments: number;
    completed_assignments: number;
    average_grade: number;
    completion_percentage: number;
}

interface PendingAssignment {
    id: string;
    title: string;
    description: string;
    section_name: string;
    teacher_name: string;
    due_date: string;
    max_score: number;
}

interface StudentHomeProps {
    onNavigate: (tabId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Subject icon picker — maps keywords to Lucide icons                */
/* ------------------------------------------------------------------ */

const subjectIconMap: { keywords: string[]; icon: LucideIcon; color: string; bg: string }[] = [
    { keywords: ['math', 'गणित', 'calculus', 'algebra', 'geometry'], icon: Calculator, color: 'text-blue-600', bg: 'bg-blue-50' },
    { keywords: ['science', 'विज्ञान', 'physics', 'chemistry'], icon: Atom, color: 'text-violet-600', bg: 'bg-violet-50' },
    { keywords: ['biology', 'bio', 'जीव'], icon: Beaker, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { keywords: ['english', 'अंग्रेजी', 'language', 'literature'], icon: Languages, color: 'text-rose-600', bg: 'bg-rose-50' },
    { keywords: ['social', 'history', 'geography', 'इतिहास', 'सामाजिक', 'civics'], icon: Globe2, color: 'text-amber-600', bg: 'bg-amber-50' },
    { keywords: ['nepali', 'नेपाली', 'hindi', 'हिन्दी'], icon: BookOpen, color: 'text-orange-600', bg: 'bg-orange-50' },
    { keywords: ['computer', 'programming', 'it', 'कम्प्युटर'], icon: Code, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { keywords: ['art', 'drawing', 'कला'], icon: Palette, color: 'text-pink-600', bg: 'bg-pink-50' },
    { keywords: ['music', 'संगीत'], icon: Music, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { keywords: ['pe', 'physical', 'sport', 'शारीरिक'], icon: Dumbbell, color: 'text-red-600', bg: 'bg-red-50' },
    { keywords: ['economics', 'अर्थशास्त्र', 'business', 'account'], icon: Scale, color: 'text-teal-600', bg: 'bg-teal-50' },
    { keywords: ['moral', 'ethics', 'नैतिक'], icon: GraduationCap, color: 'text-purple-600', bg: 'bg-purple-50' },
];

function getSubjectMeta(name: string) {
    const lower = name.toLowerCase();
    for (const entry of subjectIconMap) {
        if (entry.keywords.some((k) => lower.includes(k))) {
            return entry;
        }
    }
    // fallback
    return { icon: BookOpen, color: 'text-gray-600', bg: 'bg-gray-50' };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StudentHome({ onNavigate }: StudentHomeProps) {
    const [subjects, setSubjects] = useState<EnrolledSubject[]>([]);
    const [stats, setStats] = useState<StudentStats | null>(null);
    const [progress, setProgress] = useState<ProgressData | null>(null);
    const [pending, setPending] = useState<PendingAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const [sectionsRes, statsRes, progressRes, pendingRes] = await Promise.allSettled([
                api.get<{ sections: EnrolledSubject[] }>('/student/sections'),
                api.get<StudentStats>('/student/stats'),
                api.get<ProgressData>('/student/progress'),
                api.get<{ assignments: PendingAssignment[] }>('/student/assignments/pending'),
            ]);

            if (sectionsRes.status === 'fulfilled') setSubjects(sectionsRes.value.sections || []);
            if (statsRes.status === 'fulfilled') setStats(statsRes.value);
            if (progressRes.status === 'fulfilled') setProgress(progressRes.value);
            if (pendingRes.status === 'fulfilled') setPending(pendingRes.value.assignments || []);
        } catch (err: unknown) {
            const e = err as { message?: string };
            setError(e.message || 'Failed to load dashboard data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    /* ---- helpers ---- */
    const totalPending = stats?.active_assignments ?? pending.length;
    const completionPct = progress?.overall_completion ?? 0;

    const formatDueDate = (iso: string) => {
        if (!iso) return 'No due date';
        const d = new Date(iso);
        const now = new Date();
        const diff = d.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (days < 0) return 'Overdue';
        if (days === 0) return 'Due today';
        if (days === 1) return 'Due tomorrow';
        return `${days} days left`;
    };

    const urgencyColor = (iso: string) => {
        if (!iso) return 'text-gray-500';
        const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (days <= 0) return 'text-red-600';
        if (days <= 2) return 'text-orange-600';
        return 'text-gray-600';
    };

    /* ============ Loading state ============ */
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-green-600 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm">Loading your dashboard...</p>
                </div>
            </div>
        );
    }

    /* ============ Error fallback ============ */
    if (error) {
        return (
            <div className="max-w-xl mx-auto mt-16 p-6 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold text-red-800">Something went wrong</p>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                    <button
                        onClick={loadData}
                        className="mt-3 text-sm font-medium text-red-700 underline hover:text-red-900"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    /* ================================================================ */
    /*  MAIN RENDER                                                      */
    /* ================================================================ */
    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 dark:text-white">

            {/* ──────────────────── WELCOME BANNER ──────────────────── */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-600 via-emerald-600 to-teal-700 dark:from-green-900 dark:via-emerald-900 dark:to-teal-900 p-8 md:p-10 text-white shadow-xl shadow-green-600/20">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <Sparkles className="w-6 h-6 text-green-200" />
                        <span className="text-green-200 text-sm font-medium tracking-wide uppercase">Your Learning Hub</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold mb-2">
                        {totalPending > 0
                            ? `You have ${totalPending} pending task${totalPending > 1 ? 's' : ''} waiting for you`
                            : 'All caught up -- great work!'}
                    </h1>
                    <p className="text-green-100 mb-6 max-w-xl text-sm md:text-base">
                        {stats
                            ? `${stats.total_enrollments} enrolled subject${stats.total_enrollments !== 1 ? 's' : ''} · ${stats.completed_assignments} assignment${stats.completed_assignments !== 1 ? 's' : ''} completed`
                            : 'Start exploring your subjects and assignments below.'}
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => onNavigate('enrolled-sections')}
                            className="px-5 py-2.5 bg-white text-green-700 rounded-xl font-semibold hover:bg-green-50 transition-all shadow-sm text-sm flex items-center gap-2"
                        >
                            <BookOpen className="w-4 h-4" />
                            My Subjects
                        </button>
                        <button
                            onClick={() => onNavigate('assignment-manager')}
                            className="px-5 py-2.5 bg-white/15 backdrop-blur text-white border border-white/25 rounded-xl font-semibold hover:bg-white/25 transition-all text-sm flex items-center gap-2"
                        >
                            <FileText className="w-4 h-4" />
                            Submissions
                        </button>
                    </div>
                </div>

                {/* decorative shapes */}
                <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/4" />
                <div className="absolute top-1/2 right-12 hidden lg:block">
                    <Target className="w-24 h-24 text-white/10" />
                </div>
            </div>

            {/* ──────────────────── MAIN GRID ──────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* === LEFT COLUMN (2 / 3) === */}
                <div className="lg:col-span-2 space-y-8">

                    {/* ---- Enrolled Subjects ---- */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <Layers className="w-5 h-5 text-green-600" />
                                Your Subjects
                            </h2>
                            <button
                                onClick={() => onNavigate('enrolled-sections')}
                                className="text-sm font-medium text-green-600 hover:text-green-700 flex items-center gap-1 transition-colors"
                            >
                                View All <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        {subjects.length === 0 ? (
                            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-10 text-center">
                                <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                <p className="text-gray-500">No enrolled subjects yet.</p>
                                <p className="text-sm text-gray-400 mt-1">Contact your school to be enrolled in your classes.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {subjects.slice(0, 6).map((sub) => {
                                    const meta = getSubjectMeta(sub.subject_name);
                                    const Icon = meta.icon;
                                    return (
                                        <button
                                            key={`${sub.section_id}-${sub.chatbot_id}`}
                                            onClick={() => onNavigate('enrolled-sections')}
                                            className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 text-left hover:shadow-lg hover:border-green-200 dark:hover:border-green-800 transition-all group"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${meta.bg} ${meta.color}`}>
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                                {(sub.pending_assignments ?? 0) > 0 && (
                                                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                                                        {sub.pending_assignments} pending
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="font-bold text-gray-800 dark:text-white mb-0.5 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors leading-snug">
                                                {sub.subject_name}
                                            </h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                {sub.teacher_name} &middot; {sub.class_name}
                                            </p>
                                            {sub.attendance_percentage !== undefined && (
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-gray-500">Attendance</span>
                                                        <span className="font-semibold text-gray-700 dark:text-gray-300">{Math.round(sub.attendance_percentage)}%</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all duration-700 bg-green-500"
                                                            style={{ width: `${Math.min(sub.attendance_percentage, 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* ---- Progress Chart ---- */}
                    {progress && progress.courses.length > 0 && (
                        <section className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6">
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-5 flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-green-600" />
                                Course Progress
                            </h2>
                            <div className="space-y-4">
                                {progress.courses.map((c) => (
                                    <div key={c.course_id}>
                                        <div className="flex justify-between items-center text-sm mb-1.5">
                                            <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{c.course_name}</span>
                                            <span className="text-xs text-gray-500">
                                                {c.completed_assignments}/{c.total_assignments} done
                                                {c.average_grade > 0 && (
                                                    <span className="ml-2 text-green-600 font-semibold">{c.average_grade}%</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-1000 ${c.completion_percentage >= 75
                                                        ? 'bg-green-500'
                                                        : c.completion_percentage >= 40
                                                            ? 'bg-amber-500'
                                                            : 'bg-red-400'
                                                    }`}
                                                style={{ width: `${Math.min(c.completion_percentage, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ---- Quick Actions ---- */}
                    <section>
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-green-600" />
                            Quick Actions
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[
                                { icon: MessageSquare, label: 'AI Assistant', desc: 'Ask anything', color: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400', tab: 'chat' },
                                { icon: Brain, label: 'Quizzes', desc: 'Test yourself', color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', tab: 'quiz' },
                                { icon: CreditCard, label: 'Flashcards', desc: 'Study cards', color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400', tab: 'flashcards' },
                                { icon: CheckSquare, label: 'Submissions', desc: 'Your work', color: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400', tab: 'assignment-manager' },
                                { icon: BookOpen, label: 'Subjects', desc: 'Browse all', color: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400', tab: 'enrolled-sections' },
                                { icon: TrendingUp, label: 'Progress', desc: 'Your stats', color: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400', tab: 'enrolled-sections' },
                            ].map((item) => (
                                <button
                                    key={item.tab + item.label}
                                    onClick={() => onNavigate(item.tab)}
                                    className="flex flex-col items-center justify-center gap-2 p-5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl hover:shadow-md hover:border-green-200 dark:hover:border-green-800 transition-all group"
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform`}>
                                        <item.icon className="w-5 h-5" />
                                    </div>
                                    <span className="font-semibold text-sm text-gray-800 dark:text-white">{item.label}</span>
                                    <span className="text-[11px] text-gray-400">{item.desc}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                </div>

                {/* === RIGHT COLUMN (1 / 3) === */}
                <div className="space-y-6">

                    {/* ---- Overall completion ring ---- */}
                    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-2xl">
                        <h3 className="font-bold text-gray-800 dark:text-white mb-5 flex items-center gap-2">
                            <Target className="w-5 h-5 text-green-600" />
                            Overall Progress
                        </h3>
                        <div className="flex items-center justify-center relative w-40 h-40 mx-auto mb-4">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 192 192">
                                <circle cx="96" cy="96" r="80" className="stroke-gray-100 dark:stroke-gray-800" strokeWidth="14" fill="none" />
                                <circle
                                    cx="96" cy="96" r="80"
                                    className="stroke-green-500"
                                    strokeWidth="14"
                                    fill="none"
                                    strokeDasharray={2 * Math.PI * 80}
                                    strokeDashoffset={2 * Math.PI * 80 * (1 - completionPct / 100)}
                                    strokeLinecap="round"
                                    style={{ transition: 'stroke-dashoffset 1s ease' }}
                                />
                            </svg>
                            <div className="absolute text-center">
                                <span className="block text-3xl font-bold text-gray-800 dark:text-white">{Math.round(completionPct)}%</span>
                                <span className="text-xs text-gray-500">Completed</span>
                            </div>
                        </div>
                        {progress && (
                            <div className="text-center space-y-1">
                                <p className="text-sm text-gray-500">
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">{progress.completed_assignments}</span> of{' '}
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">{progress.total_assignments}</span> assignments done
                                </p>
                                {progress.overall_average_grade > 0 && (
                                    <p className="text-sm text-gray-500">
                                        Average grade: <span className="font-semibold text-green-600">{progress.overall_average_grade}%</span>
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ---- AI Assistant Promo Card ---- */}
                    <button
                        onClick={() => onNavigate('chat')}
                        className="w-full bg-gradient-to-br from-violet-500 to-indigo-600 dark:from-violet-800 dark:to-indigo-900 text-white rounded-2xl p-6 text-left hover:shadow-lg hover:shadow-violet-500/20 transition-all group"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur">
                                <MessageSquare className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-lg">AI Assistant</h3>
                        </div>
                        <p className="text-violet-100 text-sm mb-4 leading-relaxed">
                            Ask questions about your course material, get explanations, and prepare for exams.
                        </p>
                        <span className="inline-flex items-center text-sm font-medium text-white/90 group-hover:text-white gap-1 transition-colors">
                            Start a conversation <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </span>
                    </button>

                    {/* ---- Upcoming Deadlines ---- */}
                    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <Clock className="w-5 h-5 text-orange-500" />
                                Upcoming Deadlines
                            </h3>
                            {pending.length > 3 && (
                                <button
                                    onClick={() => onNavigate('assignment-manager')}
                                    className="text-xs text-green-600 font-medium hover:text-green-700"
                                >
                                    See all
                                </button>
                            )}
                        </div>

                        {pending.length === 0 ? (
                            <div className="text-center py-6">
                                <CheckSquare className="w-10 h-10 mx-auto mb-2 text-green-300" />
                                <p className="text-sm text-gray-500">No pending assignments</p>
                                <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {pending.slice(0, 4).map((a) => (
                                    <div
                                        key={a.id}
                                        className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                                        onClick={() => onNavigate('assignment-manager')}
                                    >
                                        <div className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${urgencyColor(a.due_date).includes('red') ? 'bg-red-500' :
                                                urgencyColor(a.due_date).includes('orange') ? 'bg-orange-500' : 'bg-gray-400'
                                            }`} />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{a.title}</h4>
                                            <p className="text-xs text-gray-500 mt-0.5">{a.section_name}</p>
                                            <div className="flex items-center gap-1 mt-1">
                                                <Calendar className="w-3 h-3 text-gray-400" />
                                                <span className={`text-xs font-medium ${urgencyColor(a.due_date)}`}>
                                                    {a.due_date ? formatDueDate(a.due_date) : 'No deadline'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ---- Quick Stats Mini ---- */}
                    {stats && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 text-center">
                                <GraduationCap className="w-6 h-6 mx-auto mb-1 text-blue-500" />
                                <p className="text-xl font-bold text-gray-800 dark:text-white">{stats.total_enrollments}</p>
                                <p className="text-[11px] text-gray-500">Subjects</p>
                            </div>
                            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 text-center">
                                <History className="w-6 h-6 mx-auto mb-1 text-green-500" />
                                <p className="text-xl font-bold text-gray-800 dark:text-white">{stats.completed_assignments}</p>
                                <p className="text-[11px] text-gray-500">Completed</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
