import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Chatbot, LessonPlanResponse, GenerateLessonPlanRequest } from '../../types';
import {
    Loader2,
    Wand2, // Magic wand for generation
    Save,
    AlertCircle,
    FileText
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export function LessonPlanner() {
    const [courses, setCourses] = useState<Chatbot[]>([]);
    const [isLoadingCourses, setIsLoadingCourses] = useState(true);

    // Form State
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [topic, setTopic] = useState('');
    const [duration, setDuration] = useState('45 minutes');

    // Generation State
    const [isGenerating, setIsGenerating] = useState(false);
    const [lessonPlan, setLessonPlan] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchCourses();
    }, []);

    const fetchCourses = async () => {
        try {
            const data = await api.get<{ chatbots: Chatbot[] }>('/chatbots/list');
            setCourses(data.chatbots);
            if (data.chatbots.length > 0) setSelectedCourseId(data.chatbots[0].id);
        } catch (err) {
            console.error('Failed to load courses', err);
        } finally {
            setIsLoadingCourses(false);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCourseId || !topic) return;

        setIsGenerating(true);
        setError(null);
        setLessonPlan(null);

        try {
            const payload: GenerateLessonPlanRequest = {
                chatbot_id: selectedCourseId,
                topic,
                duration
            };

            const response = await api.post<LessonPlanResponse>('/instructor/generate-lesson-plan', payload);
            setLessonPlan(response.lesson_plan);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate lesson plan');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = async () => {
        if (!selectedCourseId || !lessonPlan || !topic) return;
        try {
            await api.post('/instructor/lesson-plans/save', {
                chatbot_id: selectedCourseId,
                title: topic,
                topic: topic,
                content: lessonPlan,
                objectives: [],
                examples: [],
                activities: []
            });
            alert("Lesson plan saved successfully!");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save lesson plan");
        }
    };

    return (
        <div className="flex h-full gap-6">
            {/* Left: Configuration Panel */}
            <div className="w-1/3 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-purple-600" />
                    Plan Lesson
                </h2>

                <form onSubmit={handleGenerate} className="space-y-6 flex-1">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Course</label>
                        <select
                            value={selectedCourseId}
                            onChange={(e) => setSelectedCourseId(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                            disabled={isLoadingCourses}
                        >
                            {courses.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
                        <input
                            type="text"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="e.g. Introduction to Cells"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                        <input
                            type="text"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            placeholder="e.g. 45 minutes, 1 hour"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={isGenerating || !selectedCourseId || !topic}
                            className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white py-3 rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors font-semibold"
                        >
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                            {isGenerating ? 'Designing Plan...' : 'Generate Plan'}
                        </button>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                </form>
            </div>

            {/* Right: Preview Panel */}
            <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                <div className="flex justify-between items-center mb-6 pb-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Lesson Plan Preview</h2>
                    {lessonPlan && (
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
                            <Save className="w-4 h-4" />
                            Save Plan
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto pr-2">
                    {!lessonPlan ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <FileText className="w-8 h-8 opacity-20" />
                            </div>
                            <p>Generated lesson plan will appear here.</p>
                        </div>
                    ) : (
                        <article className="prose prose-sm md:prose-base max-w-none text-gray-800">
                            {/* Render Markdown content */}
                            <ReactMarkdown>{lessonPlan}</ReactMarkdown>
                        </article>
                    )}
                </div>
            </div>
        </div>
    );
}
