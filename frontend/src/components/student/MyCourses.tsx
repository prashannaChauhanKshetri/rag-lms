import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Chatbot } from '../../types';
import { BookOpen, AlertCircle, Loader2 } from 'lucide-react';

interface MyCoursesProps {
    onNavigate: (tabId: string, courseId?: string) => void;
}

export function MyCourses({ onNavigate }: MyCoursesProps) {
    const [courses, setCourses] = useState<Chatbot[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchCourses = async () => {
            try {
                // The backend returns { chatbots: [...] }
                const data = await api.get<{ chatbots: Chatbot[] }>('/chatbots/list');
                setCourses(data.chatbots);
            } catch (err) {
                console.error(err); // Log for debugging
                setError('Failed to load courses. Please try again later.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchCourses();
    }, []);

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex card bg-red-50 border border-red-200 p-4 rounded-xl items-center gap-3 text-red-700">
                <AlertCircle className="h-5 w-5" />
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-gray-900">My Courses</h1>
            </div>

            {courses.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-gray-100 shadow-sm">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BookOpen className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No courses found</h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                        It looks like you aren't enrolled in any courses yet. Ask your instructor to create some!
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {courses.map((course) => (
                        <div
                            key={course.id}
                            className="group bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer"
                            onClick={() => onNavigate('chat', course.id)}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                                    <BookOpen className="h-6 w-6" />
                                </div>
                                <span className="text-xs font-medium px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg">
                                    Active
                                </span>
                            </div>

                            <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-1">
                                {course.name}
                            </h3>

                            <p className="text-sm text-gray-500 mb-6 line-clamp-2 min-h-[40px]">
                                {course.description || "No description available for this course."}
                            </p>

                            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-500">
                                    Last updated: {new Date(course.updated_at || course.created_at).toLocaleDateString()}
                                </span>
                                <span className="text-sm font-semibold text-green-600 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                                    Start Learning &rarr;
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
