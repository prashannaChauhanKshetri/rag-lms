import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Chatbot } from '../../types';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { Activity, Users, Award, BookOpen } from 'lucide-react';

interface AnalyticsData {
    total_quizzes: number;
    total_submissions: number;
    average_score: number;
    scores_distribution: number[];
}

export function AnalyticsDashboard() {
    const [courses, setCourses] = useState<Chatbot[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchCourses();
    }, []);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await api.get<AnalyticsData>(`/instructor/analytics/course/${selectedCourseId}`);
                setData(res);
            } catch (err) {
                console.error(err);
            }
        };

        if (selectedCourseId) {
            fetchAnalytics();
        }
    }, [selectedCourseId]);

    const fetchCourses = async () => {
        try {
            const res = await api.get<{ chatbots: Chatbot[] }>('/chatbots/list');
            setCourses(res.chatbots);
            if (res.chatbots.length > 0) setSelectedCourseId(res.chatbots[0].id);
        } finally {
            setIsLoading(false);
        }
    };

    // Prepare chart data
    const scoreData = data ? [
        { name: '0-20%', count: data.scores_distribution.filter(s => s < 20).length },
        { name: '20-40%', count: data.scores_distribution.filter(s => s >= 20 && s < 40).length },
        { name: '40-60%', count: data.scores_distribution.filter(s => s >= 40 && s < 60).length },
        { name: '60-80%', count: data.scores_distribution.filter(s => s >= 60 && s < 80).length },
        { name: '80-100%', count: data.scores_distribution.filter(s => s >= 80).length },
    ] : [];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-white">
                    <Activity className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    Course Analytics
                </h1>
                <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="px-3 py-1 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            {data && (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                <BookOpen className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Total Quizzes</p>
                                <p className="text-2xl font-bold dark:text-white">{data.total_quizzes}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
                            <div className="p-3 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                                <Users className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Total Submissions</p>
                                <p className="text-2xl font-bold dark:text-white">{data.total_submissions}</p>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4">
                            <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
                                <Award className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Average Score</p>
                                <p className="text-2xl font-bold dark:text-white">{data.average_score.toFixed(1)}%</p>
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold mb-6 dark:text-white">Score Distribution</h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={scoreData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(107,114,128,0.3)" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(107,114,128,0.1)' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: 'var(--tt-bg, #fff)' }}
                                    />
                                    <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}

            {!data && !isLoading && (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                    No data available for this course.
                </div>
            )}
        </div>
    );
}
