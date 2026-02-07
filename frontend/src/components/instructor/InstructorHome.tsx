import {
    BookOpen,
    FileText,
    GraduationCap,
    BarChart2,
    Send,
    Bell,
    Users
} from 'lucide-react';
import type { User } from '../../types';

interface InstructorHomeProps {
    user: User;
    onNavigate: (tabId: string) => void;
}

export function InstructorHome({ user, onNavigate }: InstructorHomeProps) {
    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 dark:text-gray-100">
            {/* 1. Welcome Header (Similar to Student) */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-900 dark:to-violet-900 p-8 text-white shadow-xl shadow-indigo-500/20 dark:shadow-indigo-900/20">
                <div className="relative z-10">
                    <h1 className="text-3xl font-bold mb-2">Welcome back, {user.full_name.split(' ')[0]}! 👋</h1>
                    <p className="text-indigo-100 mb-6 max-w-lg">
                        You have 3 classes scheduled today and 5 assignments to review.
                    </p>
                    <div className="flex gap-4">
                        <button
                            onClick={() => onNavigate('courses')}
                            className="px-6 py-2.5 bg-white text-indigo-600 rounded-xl font-semibold hover:bg-indigo-50 transition-colors shadow-sm"
                        >
                            Manage Courses
                        </button>
                        <button
                            onClick={() => onNavigate('quizzes')}
                            className="px-6 py-2.5 bg-indigo-500/30 text-white border border-indigo-400/50 rounded-xl font-semibold hover:bg-indigo-500/40 transition-colors"
                        >
                            Create Quiz
                        </button>
                    </div>
                </div>
                {/* Decorative background similar to student home */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>
            </div>

            {/* 2. Main Action Cards (Grid) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    {
                        title: 'Course Management',
                        desc: 'Create courses & upload resources',
                        icon: BookOpen,
                        color: 'bg-blue-50 text-blue-600',
                        id: 'courses',
                        borderColor: 'border-blue-100'
                    },
                    {
                        title: 'Quiz Creator',
                        desc: 'Generate AI assessments',
                        icon: FileText,
                        color: 'bg-green-50 text-green-600',
                        id: 'quizzes',
                        borderColor: 'border-green-100'
                    },
                    {
                        title: 'Grade Assignments',
                        desc: 'Review submissions',
                        icon: GraduationCap,
                        color: 'bg-orange-50 text-orange-600',
                        id: 'grading', // Placeholder
                        borderColor: 'border-orange-100'
                    },
                    {
                        title: 'Student Performance',
                        desc: 'View analytics & insights',
                        icon: BarChart2,
                        color: 'bg-purple-50 text-purple-600',
                        id: 'performance', // Placeholder
                        borderColor: 'border-purple-100'
                    }
                ].map((card) => (
                    <div
                        key={card.id}
                        onClick={() => onNavigate(card.id)}
                        className={`bg-white p-6 rounded-2xl border ${card.borderColor} shadow-sm hover:shadow-md transition-all cursor-pointer group`}
                    >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${card.color} group-hover:scale-110 transition-transform`}>
                            <card.icon className="w-6 h-6" />
                        </div>
                        <h3 className="font-bold text-gray-800 text-lg mb-1">{card.title}</h3>
                        <p className="text-sm text-gray-500">{card.desc}</p>
                    </div>
                ))}
            </div>

            {/* 3. Secondary Section: Chat & Announcements */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Chat Section */}
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-pink-50 rounded-lg text-pink-600">
                                <Send className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-gray-800">Chat with Students</h3>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-pink-50 to-white rounded-2xl p-6 border border-pink-100 text-center">
                        <Users className="w-12 h-12 mx-auto text-pink-300 mb-3" />
                        <h4 className="font-semibold text-gray-800 mb-2">Engage in 1-on-1 Chat</h4>
                        <p className="text-sm text-gray-500 mb-4">
                            Collaborate with students, answer queries, and provide guidance directly.
                        </p>
                        <button className="px-4 py-2 bg-white border border-pink-200 text-pink-600 rounded-lg text-sm font-medium hover:bg-pink-50 transition-colors">
                            Open Chat
                        </button>
                    </div>
                </div>

                {/* Announcements Section */}
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                                <Bell className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-gray-800">Class Announcements</h3>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-teal-50 to-white rounded-2xl p-6 border border-teal-100 text-center">
                        <Bell className="w-12 h-12 mx-auto text-teal-300 mb-3" />
                        <h4 className="font-semibold text-gray-800 mb-2">Broadcast Updates</h4>
                        <p className="text-sm text-gray-500 mb-4">
                            Send assignments notification, exam schedules, or general updates to your classes.
                        </p>
                        <button className="px-4 py-2 bg-white border border-teal-200 text-teal-600 rounded-lg text-sm font-medium hover:bg-teal-50 transition-colors">
                            Create Announcement
                        </button>
                    </div>
                </div>
            </div>

            {/* 4. Bottom Section: Tasks (Notice Board) */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="border-b p-4 px-6 bg-gray-50 flex gap-6">
                    <button className="font-semibold text-indigo-600 border-b-2 border-indigo-600 pb-4 -mb-4.5 px-2">
                        Notice Board
                    </button>
                    <button className="font-medium text-gray-500 hover:text-gray-700 pb-4 -mb-4.5 px-2 transition-colors">
                        Today's Tasks
                    </button>
                    <button className="font-medium text-gray-500 hover:text-gray-700 pb-4 -mb-4.5 px-2 transition-colors">
                        Upcoming Tasks
                    </button>
                </div>
                <div className="p-6">
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                            <Bell className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800 mb-1">Staff Meeting</h4>
                            <p className="text-sm text-gray-600 mb-2">
                                Please join the monthly staff meeting on May 10, 2023 at 10:00 AM in the Conference Hall.
                            </p>
                            <span className="text-xs text-gray-400">Principal Office • May 8, 2023</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
