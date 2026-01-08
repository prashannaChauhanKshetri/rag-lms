import { Play, Clock, Star, TrendingUp, Calendar, ChevronRight } from 'lucide-react';

interface StudentHomeProps {
    onNavigate: (tabId: string) => void;
}

export function StudentHome({ onNavigate }: StudentHomeProps) {
    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Welcome Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-white shadow-xl shadow-green-500/20">
                <div className="relative z-10">
                    <h1 className="text-3xl font-bold mb-2">Ready to learn, Alex? 🚀</h1>
                    <p className="text-green-50 mb-6 max-w-lg">
                        You have 2 pending assignments and a quiz due today. Keep up the momentum!
                    </p>
                    <div className="flex gap-4">
                        <button
                            onClick={() => onNavigate('courses')}
                            className="px-6 py-2.5 bg-white text-green-600 rounded-xl font-semibold hover:bg-green-50 transition-colors shadow-sm"
                        >
                            Resume Learning
                        </button>
                        <button
                            onClick={() => onNavigate('assignments')}
                            className="px-6 py-2.5 bg-green-600 text-white border border-green-400 rounded-xl font-semibold hover:bg-green-700 transition-colors"
                        >
                            View Assignments
                        </button>
                    </div>
                </div>

                {/* Decorative Circles */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column (2/3) */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Recent Courses */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-800">Continue Learning</h2>
                            <button
                                onClick={() => onNavigate('courses')}
                                className="text-sm font-medium text-green-600 hover:text-green-700 flex items-center gap-1"
                            >
                                View All <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[1, 2].map((i) => (
                                <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 hover:shadow-lg transition-shadow cursor-pointer group">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${i === 1 ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {i === 1 ? <TrendingUp className="w-6 h-6" /> : <Star className="w-6 h-6" />}
                                        </div>
                                        <span className="text-xs font-medium px-2 py-1 bg-gray-50 text-gray-500 rounded-lg">In Progress</span>
                                    </div>
                                    <h3 className="font-bold text-lg text-gray-800 mb-1 group-hover:text-green-600 transition-colors">
                                        {i === 1 ? 'Advanced Microeconomics' : 'Molecular Biology'}
                                    </h3>
                                    <p className="text-sm text-gray-500 mb-4">Chapter 4 • 2h 15m left</p>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-xs font-medium">
                                            <span className="text-gray-600">Progress</span>
                                            <span className="text-green-600">{i === 1 ? '75%' : '45%'}</span>
                                        </div>
                                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-green-500 rounded-full transition-all duration-1000"
                                                style={{ width: i === 1 ? '75%' : '45%' }}
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { icon: Play, label: 'Resume', color: 'bg-indigo-100 text-indigo-600', action: () => onNavigate('courses') },
                            { icon: Clock, label: 'History', color: 'bg-pink-100 text-pink-600', action: () => { } },
                            { icon: Star, label: 'Favorites', color: 'bg-yellow-100 text-yellow-600', action: () => { } },
                            { icon: Calendar, label: 'Schedule', color: 'bg-purple-100 text-purple-600', action: () => onNavigate('timetable') },
                        ].map((item, idx) => (
                            <button
                                key={idx}
                                onClick={item.action}
                                className="flex flex-col items-center justify-center gap-3 p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md transition-all group"
                            >
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform`}>
                                    <item.icon className="w-5 h-5" />
                                </div>
                                <span className="font-medium text-gray-700">{item.label}</span>
                            </button>
                        ))}
                    </div>

                </div>

                {/* Right Column (1/3) */}
                <div className="space-y-8">
                    {/* Daily Goal */}
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                        <h3 className="font-bold text-gray-800 mb-4">Daily Goal</h3>
                        <div className="flex items-center justify-center relative w-48 h-48 mx-auto mb-4">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle
                                    cx="96" cy="96" r="88"
                                    className="stroke-gray-100"
                                    strokeWidth="12"
                                    fill="none"
                                />
                                <circle
                                    cx="96" cy="96" r="88"
                                    className="stroke-green-500"
                                    strokeWidth="12"
                                    fill="none"
                                    strokeDasharray={2 * Math.PI * 88}
                                    strokeDashoffset={2 * Math.PI * 88 * (1 - 0.7)}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute text-center">
                                <span className="block text-4xl font-bold text-gray-800">70%</span>
                                <span className="text-sm text-gray-500">Completed</span>
                            </div>
                        </div>
                        <p className="text-center text-sm text-gray-600">
                            You've studied for <span className="font-bold text-green-600">3.5 hours</span> today. Keep it up!
                        </p>
                    </div>

                    {/* Upcoming Deadlines */}
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                        <h3 className="font-bold text-gray-800 mb-4">Upcoming Deadlines</h3>
                        <div className="space-y-4">
                            {[
                                { title: 'Economics Essay', due: 'Tomorrow, 11:59 PM', type: 'Assignment', color: 'orange' },
                                { title: 'Biology Quiz', due: 'Fri, 10:00 AM', type: 'Quiz', color: 'blue' }
                            ].map((item, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                                    <div className={`w-2 h-2 mt-2 rounded-full bg-${item.color}-500 flex-shrink-0`}></div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-800">{item.title}</h4>
                                        <p className="text-xs text-gray-500 mt-1">{item.due}</p>
                                        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mt-2 block">{item.type}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
