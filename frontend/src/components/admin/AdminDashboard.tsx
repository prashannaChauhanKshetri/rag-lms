import React, { useState, useEffect } from 'react';
import {
    Users,
    BookOpen,
    Brain,
    GraduationCap,
    TrendingUp,
    Loader2,
    ArrowRight,
    UserPlus,
    Layers,
    Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';

// --- Interfaces ---

interface DashboardStats {
    total_teachers: number;
    total_students: number;
    total_course_bots: number;
    total_classes: number;
    recent_teachers: Array<{ id: string; username: string; full_name?: string; created_at?: string }>;
    recent_bots: Array<{ id: string; name: string; created_at?: string }>;
}

interface AdminDashboardProps {
    onNavigate: (tabId: string) => void;
}

// --- Component ---

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadStats = async () => {
            try {
                const data = await api.get<DashboardStats>('/admin/dashboard-stats');
                setStats(data);
            } catch (err) {
                console.error('Failed to load dashboard stats:', err);
            } finally {
                setIsLoading(false);
            }
        };
        loadStats();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    const statCards = [
        { label: 'Teachers', value: stats?.total_teachers ?? 0, icon: Users, color: 'bg-blue-50 text-blue-600', borderColor: 'border-blue-100', tab: 'teachers' },
        { label: 'Students', value: stats?.total_students ?? 0, icon: GraduationCap, color: 'bg-emerald-50 text-emerald-600', borderColor: 'border-emerald-100', tab: 'enrollments' },
        { label: 'Course Bots', value: stats?.total_course_bots ?? 0, icon: Brain, color: 'bg-purple-50 text-purple-600', borderColor: 'border-purple-100', tab: 'courses' },
        { label: 'Classes', value: stats?.total_classes ?? 0, icon: BookOpen, color: 'bg-amber-50 text-amber-600', borderColor: 'border-amber-100', tab: 'classes' },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Welcome Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 p-8 text-white shadow-xl shadow-indigo-500/20">
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-5 h-5 text-indigo-200" />
                        <span className="text-indigo-200 text-sm font-medium">Admin Dashboard</span>
                    </div>
                    <h1 className="text-3xl font-bold mb-2">Welcome to RAG-LMS</h1>
                    <p className="text-indigo-100 mb-6 max-w-lg">
                        Manage course bots, classes, sections, and enrollments from one place.
                        Your institution has {stats?.total_teachers ?? 0} teachers and {stats?.total_students ?? 0} students.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={() => onNavigate('courses')}
                            className="px-5 py-2.5 bg-white text-indigo-600 rounded-xl font-semibold hover:bg-indigo-50 transition-colors shadow-sm text-sm"
                        >
                            Manage Course Bots
                        </button>
                        <button
                            onClick={() => onNavigate('classes')}
                            className="px-5 py-2.5 bg-indigo-500/30 text-white border border-indigo-400/50 rounded-xl font-semibold hover:bg-indigo-500/40 transition-colors text-sm"
                        >
                            Manage Classes
                        </button>
                    </div>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map(card => (
                    <div
                        key={card.label}
                        onClick={() => onNavigate(card.tab)}
                        className={`bg-white p-5 rounded-2xl border ${card.borderColor} shadow-sm hover:shadow-md transition-all cursor-pointer group`}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color} group-hover:scale-110 transition-transform`}>
                                <card.icon className="w-5 h-5" />
                            </div>
                            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
                    </div>
                ))}
            </div>

            {/* Quick Actions + Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quick Actions */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-indigo-600" />
                        Quick Actions
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: 'New Course Bot', icon: Brain, color: 'text-purple-600 bg-purple-50', tab: 'courses' },
                            { label: 'New Class', icon: BookOpen, color: 'text-blue-600 bg-blue-50', tab: 'classes' },
                            { label: 'Enroll Students', icon: UserPlus, color: 'text-emerald-600 bg-emerald-50', tab: 'enrollments' },
                            { label: 'Manage Sections', icon: Layers, color: 'text-amber-600 bg-amber-50', tab: 'classes' },
                        ].map(action => (
                            <button
                                key={action.label}
                                onClick={() => onNavigate(action.tab)}
                                className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-100 hover:bg-gray-50 hover:shadow-sm transition-all text-left group"
                            >
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${action.color} group-hover:scale-110 transition-transform`}>
                                    <action.icon className="w-4 h-4" />
                                </div>
                                <span className="text-sm font-medium text-gray-700">{action.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Recent Course Bots */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                            <Brain className="w-4 h-4 text-indigo-600" />
                            Recent Course Bots
                        </h3>
                        <button
                            onClick={() => onNavigate('courses')}
                            className="text-xs text-indigo-600 font-medium hover:text-indigo-700"
                        >
                            View all →
                        </button>
                    </div>
                    {(stats?.recent_bots?.length ?? 0) === 0 ? (
                        <div className="text-center py-6">
                            <Brain className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">No course bots yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {stats?.recent_bots?.map(bot => (
                                <div
                                    key={bot.id}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors"
                                >
                                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                                        <Brain className="w-4 h-4 text-purple-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">{bot.name}</p>
                                        {bot.created_at && (
                                            <p className="text-xs text-gray-400">
                                                {new Date(bot.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
