import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Chatbot, Question, GenerateQuestionsRequest, GeneratedQuiz } from '../../types';
import {
    Loader2,
    BookOpen,
    RefreshCcw,
    Save,
    AlertCircle,
    FileText,
    Plus,
    Trash2,
    Check
} from 'lucide-react';

export function QuizCreator() {
    const [courses, setCourses] = useState<Chatbot[]>([]);

    // Form State
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [topic, setTopic] = useState('');
    const [questionCount, setQuestionCount] = useState(5);
    const [difficulty, setDifficulty] = useState('medium');

    // AI Options
    const [selectedTypes, setSelectedTypes] = useState<string[]>(['mcq', 'true_false', 'short_answer']);

    // Manual Mode
    const [mode, setMode] = useState<'ai' | 'manual'>('ai');
    const [manualQText, setManualQText] = useState('');
    const [manualQType, setManualQType] = useState('mcq');
    const [manualOptions, setManualOptions] = useState<string[]>(['', '', '', '']);
    const [manualCorrect, setManualCorrect] = useState('');

    // Generation State
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const questionTypes = [
        { id: 'mcq', label: 'Multiple Choice' },
        { id: 'true_false', label: 'True/False' },
        { id: 'very_short_answer', label: 'Very Short Answer' },
        { id: 'short_answer', label: 'Short Answer' },
        { id: 'long_answer', label: 'Long Answer' }
    ];

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
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCourseId || selectedTypes.length === 0) {
            setError("Please select a course and at least one question type");
            return;
        }

        setIsGenerating(true);
        setError(null);
        setSuccessMsg(null);

        try {
            const payload: GenerateQuestionsRequest = {
                chatbot_id: selectedCourseId,
                topic,
                count: questionCount,
                difficulty,
                types: selectedTypes
            };

            const response = await api.post<GeneratedQuiz>('/instructor/generate-questions', payload);
            setGeneratedQuestions(prev => [...prev, ...response.questions]);
            setSuccessMsg(`Generated ${response.questions.length} questions!`);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate quiz');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAddManual = (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualQText || !manualCorrect) return;

        const newQ: Question = {
            question_text: manualQText,
            question_type: manualQType as Question['question_type'],
            correct_answer: manualCorrect,
        };

        if (manualQType === 'mcq') {
            newQ.options = manualOptions;
        }

        setGeneratedQuestions(prev => [...prev, newQ]);
        setManualQText('');
        setManualCorrect('');
        setManualOptions(['', '', '', '']);
        setSuccessMsg("Question added manually!");
    };

    const handlePublish = async () => {
        if (!selectedCourseId || generatedQuestions.length === 0) return;
        try {
            await api.post('/instructor/quizzes/create', {
                chatbot_id: selectedCourseId,
                title: topic || "New Quiz",
                questions: generatedQuestions
            });
            setSuccessMsg("Quiz successfully published to students!");
            setGeneratedQuestions([]);
            setTopic('');
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to publish");
        }
    };

    const toggleType = (id: string) => {
        setSelectedTypes(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    };

    return (
        <div className="flex h-full gap-6">
            {/* Left: Configuration Panel */}
            <div className="w-1/3 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full overflow-y-auto">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#10B981]" />
                    Quiz Creator
                </h2>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Course</label>
                    <select
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#10B981] outline-none bg-white"
                    >
                        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg mb-6">
                    <button
                        onClick={() => setMode('ai')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'ai' ? 'bg-white shadow text-[#10B981]' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        AI Generator
                    </button>
                    <button
                        onClick={() => setMode('manual')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'manual' ? 'bg-white shadow text-[#10B981]' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Manual Entry
                    </button>
                </div>

                {mode === 'ai' ? (
                    <form onSubmit={handleGenerate} className="space-y-6 flex-1">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
                            <input
                                type="text"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="e.g. Newton's Laws"
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#10B981] outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Question Types</label>
                            <div className="space-y-2">
                                {questionTypes.map(t => (
                                    <label key={t.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedTypes.includes(t.id)}
                                            onChange={() => toggleType(t.id)}
                                            className="rounded text-[#10B981] focus:ring-[#10B981]"
                                        />
                                        {t.label}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                                <select
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg outline-none"
                                >
                                    <option value="easy">Easy</option>
                                    <option value="medium">Medium</option>
                                    <option value="hard">Hard</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Count</label>
                                <input
                                    type="number"
                                    min="1" max="20"
                                    value={questionCount}
                                    onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border rounded-lg outline-none"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isGenerating || !selectedCourseId}
                            className="w-full flex items-center justify-center gap-2 bg-[#10B981] text-white py-3 rounded-xl hover:bg-[#059669] disabled:opacity-50 transition-colors font-semibold"
                        >
                            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCcw className="w-5 h-5" />}
                            Generate Quiz
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleAddManual} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                            <select
                                value={manualQType}
                                onChange={(e) => setManualQType(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg outline-none"
                            >
                                {questionTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                            <textarea
                                value={manualQText}
                                onChange={(e) => setManualQText(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg outline-none h-20"
                                placeholder="Enter question..."
                            />
                        </div>

                        {manualQType === 'mcq' && (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">Options (A-D)</label>
                                {manualOptions.map((opt, i) => (
                                    <input
                                        key={i}
                                        value={opt}
                                        onChange={(e) => {
                                            const newOps = [...manualOptions];
                                            newOps[i] = e.target.value;
                                            setManualOptions(newOps);
                                        }}
                                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                        className="w-full px-3 py-2 border rounded-lg outline-none text-sm"
                                    />
                                ))}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Correct Answer</label>
                            <input
                                value={manualCorrect}
                                onChange={(e) => setManualCorrect(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg outline-none"
                                placeholder={manualQType === 'mcq' ? 'e.g. A' : 'Enter answer...'}
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 transition-colors font-semibold"
                        >
                            <Plus className="w-5 h-5" />
                            Add Question
                        </button>
                    </form>
                )}

                {error && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-start gap-2 mt-4">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        {error}
                    </div>
                )}
                {successMsg && (
                    <div className="p-3 bg-green-50 text-green-600 rounded-lg text-sm flex items-start gap-2 mt-4">
                        <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        {successMsg}
                    </div>
                )}
            </div>

            {/* Right: Preview Panel */}
            <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                <div className="flex justify-between items-center mb-6 pb-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Preview Quiz ({generatedQuestions.length})</h2>
                    {generatedQuestions.length > 0 && (
                        <button
                            onClick={handlePublish}
                            className="flex items-center gap-2 px-4 py-2 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors text-sm font-medium shadow-sm"
                        >
                            <Save className="w-4 h-4" />
                            Publish to Students
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                    {generatedQuestions.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <FileText className="w-8 h-8 opacity-20" />
                            </div>
                            <p>Generated or added questions will appear here.</p>
                        </div>
                    ) : (
                        generatedQuestions.map((q, idx) => (
                            <div key={idx} className="p-4 rounded-xl border border-gray-200 bg-gray-50 hover:border-[#10B981]/30 transition-colors relative group">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-bold text-[#10B981] uppercase tracking-wide bg-[#10B981]/10 px-2 py-1 rounded">
                                        Q{idx + 1} • {q.question_type.replace(/_/g, ' ')}
                                    </span>
                                    <button
                                        onClick={() => setGeneratedQuestions(prev => prev.filter((_, i) => i !== idx))}
                                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-gray-900 font-medium mb-3">{q.question_text}</p>

                                {q.options && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                                        {q.options.map((opt, i) => (
                                            <div key={i} className={`text-sm p-2 rounded border ${opt === q.correct_answer ? 'bg-green-50 border-green-200 text-green-700 font-medium' : 'bg-white border-gray-200 text-gray-600'}`}>
                                                {String.fromCharCode(65 + i)}. {opt}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {(!q.options || q.options.length === 0) && (
                                    <div className="p-3 bg-green-50 border border-green-100 rounded-lg text-sm text-green-800">
                                        <strong>Answer:</strong> {q.correct_answer}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}


