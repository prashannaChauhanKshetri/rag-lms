import { useState, useEffect } from 'react';
import {
    BookOpen,
    FileText,
    GraduationCap,
    BarChart2,
    MessageSquare,
    Bell,
    Users,
    Calendar,
    Loader2,
    CreditCard,
} from 'lucide-react';
import type { User } from '../../types';
import { api } from '../../lib/api';

interface InstructorHomeProps {
    user: User;
    onNavigate: (tabId: string) => void;
}

interface DashboardStats {
    sectionCount: number;
    totalStudents: number;
}

export function InstructorHome({ user, onNavigate }: InstructorHomeProps) {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setStatsLoading(true);
                // Use the existing /instructor/sections/all endpoint which returns sections + student_count
                const sections = await api.get<{ id: string; name: string; student_count?: number }[]>(
                    '/instructor/sections/all'
                );
                const list = Array.isArray(sections) ? sections : [];
                const totalStudents = list.reduce((acc, s) => acc + (s.student_count ?? 0), 0);
                setStats({
                    sectionCount: list.length,
                    totalStudents,
                });
            } catch {
                // Silently fail — stats are nice-to-have, not critical
                setStats(null);
            } finally {
                setStatsLoading(false);
            }
        };
        fetchStats();
    }, []);

    const firstName = user.full_name?.split(' ')[0] || user.username;

    const actionCards = [
        {
            title: 'My Classes',
            desc: 'View sections and enrolled students',
            icon: Users,
            color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
            borderColor: 'border-blue-100 dark:border-blue-900/40',
            tab: 'sections',
        },
        {
            title: 'Assignments',
            desc: 'Create and manage assignments',
            icon: FileText,
            color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
            borderColor: 'border-emerald-100 dark:border-emerald-900/40',
            tab: 'assignments',
        },
        {
            title: 'Quiz Creator',
            desc: 'Generate assessments for students',
            icon: GraduationCap,
            color: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
            borderColor: 'border-orange-100 dark:border-orange-900/40',
            tab: 'quizzes',
        },
        {
            title: 'Flashcards',
            desc: 'Create study flashcard decks',
            icon: CreditCard,
            color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
            borderColor: 'border-purple-100 dark:border-purple-900/40',
            tab: 'flashcards',
        },
        {
            title: 'Attendance',
            desc: 'Record daily attendance',
            icon: Calendar,
            color: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400',
            borderColor: 'border-sky-100 dark:border-sky-900/40',
            tab: 'attendance',
        },
        {
            title: 'Analytics',
            desc: 'Track performance and engagement',
            icon: BarChart2,
            color: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400',
            borderColor: 'border-indigo-100 dark:border-indigo-900/40',
            tab: 'analytics',
        },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ── Welcome banner ────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-900 dark:to-violet-900 p-8 text-white shadow-xl shadow-indigo-500/20 dark:shadow-indigo-900/20">
                <div className="relative z-10">
                    <p className="text-indigo-200 text-sm font-medium uppercase tracking-wide mb-1">
                        Instructor Dashboard
                    </p>
                    <h1 className="text-3xl font-bold mb-2">
                        Welcome back, {firstName}
                    </h1>
                    <p className="text-indigo-100 mb-6 max-w-lg text-sm">
                        {statsLoading ? (
                            <span className="inline-flex items-center gap-2">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Loading your dashboard...
                            </span>
                        ) : stats ? (
                            <>
                                You are teaching{' '}
                                <strong>{stats.sectionCount}</strong>{' '}
                                {stats.sectionCount === 1 ? 'class' : 'classes'} with{' '}
                                <strong>{stats.totalStudents}</strong>{' '}
                                {stats.totalStudents === 1 ? 'student' : 'students'} enrolled.
                            </>
                        ) : (
                            'Manage your classes, generate assessments, and track student progress.'
                        )}
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => onNavigate('sections')}
                            className="px-5 py-2.5 bg-white text-indigo-600 rounded-xl font-semibold hover:bg-indigo-50 transition-colors shadow-sm text-sm"
                        >
                            View Classes
                        </button>
                        <button
                            onClick={() => onNavigate('quizzes')}
                            className="px-5 py-2.5 bg-indigo-500/30 text-white border border-indigo-400/50 rounded-xl font-semibold hover:bg-indigo-500/40 transition-colors text-sm"
                        >
                            Create Quiz
                        </button>
                    </div>
                </div>
                {/* Decorative blurs */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
            </div>

            {/* ── Action cards ──────────────────────────────────────────── */}
            <div>
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                    Quick Access
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {actionCards.map((card) => (
                        <button
                            key={card.tab}
                            onClick={() => onNavigate(card.tab)}
                            className={`bg-white dark:bg-gray-900 p-5 rounded-2xl border ${card.borderColor} shadow-sm hover:shadow-md transition-all cursor-pointer group text-left`}
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card.color} group-hover:scale-110 transition-transform`}>
                                <card.icon className="w-5 h-5" />
                            </div>
                            <p className="font-semibold text-gray-800 dark:text-white text-sm">{card.title}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{card.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Communication cards ───────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chat with students */}
                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                            <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 dark:text-white text-sm">AI Assistant</h3>
                            <p className="text-xs text-gray-400 dark:text-gray-500">Powered by your course bots</p>
                        </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Students can ask subject questions directly to course-specific AI assistants trained on your materials.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                        <Users className="w-3.5 h-3.5" />
                        <span>Available to enrolled students automatically</span>
                    </div>
                </div>

                {/* Announcements */}
                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center">
                            <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Announcement Board</h3>
                            <p className="text-xs text-gray-400 dark:text-gray-500">Inform your classes</p>
                        </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Broadcast exam schedules, assignment updates, and general notices to all students in your sections.
                    </p>
                    <button
                        onClick={() => onNavigate('assignments')}
                        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                        Go to Assignments →
                    </button>
                </div>
            </div>

            {/* ── Studies section: lesson plans ─────────────────────────── */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-violet-50 dark:bg-violet-900/20 rounded-lg flex items-center justify-center">
                            <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        </div>
                        <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Lesson Plans</h3>
                    </div>
                    <button
                        onClick={() => onNavigate('lesson-plans')}
                        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                        Open Planner →
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Use the AI-powered Lesson Planner to generate structured lesson plans for any topic in seconds.
                        Plans are organised by learning objectives, activities, and assessment checkpoints.
                    </p>
                </div>
            </div>

        </div>
    );
}
