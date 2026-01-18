import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Chatbot } from '../../types';
import { Loader2, Brain, CheckCircle, Clock, PlayCircle, RefreshCw } from 'lucide-react';

interface Quiz {
    id: string;
    title: string;
    description: string;
    question_count: number;
    is_published: boolean;
    created_at: string;
}

interface Question {
    id: string;
    question_text: string;
    question_type: string;
    options?: string[];
    points: number;
}

export function StudentQuizzes() {
    const [courses, setCourses] = useState<Chatbot[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Quiz Taking State
    const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
    const [quizData, setQuizData] = useState<any>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionResult, setSubmissionResult] = useState<any>(null);

    useEffect(() => {
        api.get<{ chatbots: Chatbot[] }>('/chatbots/list')
            .then(data => {
                setCourses(data.chatbots);
                if (data.chatbots.length > 0) setSelectedCourseId(data.chatbots[0].id);
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!selectedCourseId) return;
        setIsLoading(true);
        api.get<{ quizzes: Quiz[] }>(`/student/quizzes/${selectedCourseId}`)
            .then(res => setQuizzes(res.quizzes))
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [selectedCourseId]);

    const startQuiz = async (quizId: string) => {
        try {
            setIsLoading(true);
            const data = await api.get<any>(`/student/quizzes/${quizId}/take`);
            setQuizData(data);
            setActiveQuizId(quizId);
            setAnswers({});
            setSubmissionResult(null);
        } catch (error) {
            console.error(error);
            alert("Failed to start quiz");
        } finally {
            setIsLoading(false);
        }
    };

    const submitQuiz = async () => {
        if (!activeQuizId) return;
        setIsSubmitting(true);
        try {
            const userId = localStorage.getItem('user_id') || 'demo_student';
            const res = await api.post('/student/quizzes/submit', {
                quiz_id: activeQuizId,
                student_id: userId,
                answers: answers
            });
            setSubmissionResult(res);
        } catch (e) {
            console.error(e);
            alert("Failed to submit quiz");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAnswerParams = (qId: string, val: string) => {
        setAnswers(prev => ({ ...prev, [qId]: val }));
    };

    if (activeQuizId && quizData) {
        // Quiz Taking View
        return (
            <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button
                    onClick={() => { setActiveQuizId(null); setQuizData(null); setSubmissionResult(null); }}
                    className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 mb-4"
                >
                    &larr; Back to Quizzes
                </button>

                {submissionResult ? (
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-lg p-8 text-center max-w-md mx-auto">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Quiz Completed!</h2>
                        <div className="text-5xl font-extrabold text-green-600 mb-2">
                            {Math.round(submissionResult.score)}%
                        </div>
                        <p className="text-gray-500 mb-8">
                            You earned {submissionResult.earned_points} out of {submissionResult.total_points} points.
                        </p>
                        <button
                            onClick={() => { setActiveQuizId(null); setQuizData(null); setSubmissionResult(null); }}
                            className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-black transition-colors"
                        >
                            Return to List
                        </button>
                    </div>
                ) : (
                    <div className="space-y-8">
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">{quizData.title}</h1>
                            <p className="text-gray-500">{quizData.description}</p>
                            <div className="flex gap-4 mt-4 text-sm font-medium text-gray-600">
                                <span className="px-3 py-1 bg-gray-100 rounded-lg">
                                    {quizData.questions.length} Questions
                                </span>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {quizData.questions.map((q: Question, idx: number) => (
                                <div key={q.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                    <div className="flex items-start gap-4">
                                        <span className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center font-bold text-gray-500 text-sm">
                                            {idx + 1}
                                        </span>
                                        <div className="flex-1">
                                            <p className="font-semibold text-gray-900 text-lg mb-4">{q.question_text}</p>

                                            {q.question_type === 'mcq' && q.options ? (
                                                <div className="grid gap-3">
                                                    {q.options.map((opt, i) => {
                                                        const optLabel = String.fromCharCode(65 + i); // A, B, C, D
                                                        const isSelected = answers[q.id] === optLabel; // Store 'A', 'B' etc

                                                        // Note: The API expects the answer string or the option label? 
                                                        // Looking at `api.py`: 
                                                        // `student_answer == correct_answer` (case insensitive). 
                                                        // If correct_answer is "A", pass "A". If "Paris", pass "Paris".
                                                        // Usually MCQs store the option value or index. 
                                                        // `generated_questions` sets `correct_answer` to "A", "B"... 
                                                        // So we should pass "A", "B", etc.

                                                        return (
                                                            <label
                                                                key={i}
                                                                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-green-500 bg-green-50' : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                                                                    }`}
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name={q.id}
                                                                    value={optLabel}
                                                                    checked={isSelected}
                                                                    onChange={() => handleAnswerParams(q.id, optLabel)}
                                                                    className="w-5 h-5 text-green-600 focus:ring-green-500"
                                                                />
                                                                <span className="text-gray-700 font-medium">{opt}</span>
                                                            </label>
                                                        )
                                                    })}
                                                </div>
                                            ) : q.question_type === 'true_false' ? (
                                                <div className="flex gap-4">
                                                    {['True', 'False'].map(opt => (
                                                        <label key={opt} className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all ${answers[q.id]?.toLowerCase() === opt.toLowerCase()
                                                            ? 'border-green-500 bg-green-50 font-bold text-green-700'
                                                            : 'border-gray-100 hover:border-gray-200 bg-gray-50 text-gray-600'
                                                            }`}>
                                                            <input
                                                                type="radio"
                                                                name={q.id}
                                                                value={opt}
                                                                checked={answers[q.id]?.toLowerCase() === opt.toLowerCase()}
                                                                onChange={() => handleAnswerParams(q.id, opt)}
                                                                className="hidden"
                                                            />
                                                            {opt}
                                                        </label>
                                                    ))}
                                                </div>
                                            ) : (
                                                <textarea
                                                    value={answers[q.id] || ''}
                                                    onChange={(e) => handleAnswerParams(q.id, e.target.value)}
                                                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none"
                                                    placeholder="Type your answer here..."
                                                    rows={3}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end pt-4 pb-12">
                            <button
                                onClick={submitQuiz}
                                disabled={isSubmitting}
                                className="px-8 py-4 bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-600/20 hover:bg-green-700 transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                                Submit Quiz
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Brain className="w-6 h-6 text-indigo-600" />
                        Available Quizzes
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Test your knowledge and track progress</p>
                </div>
                <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="px-4 py-2 border rounded-lg bg-white shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            {isLoading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
            ) : quizzes.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-200">
                    <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Brain className="h-8 w-8 text-indigo-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No quizzes available</h3>
                    <p className="text-gray-500 max-w-sm mx-auto">
                        There are no published quizzes for this course yet.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {quizzes.map(quiz => (
                        <div key={quiz.id} className="bg-white p-6 rounded-2xl border border-gray-100 hover:border-indigo-100 hover:shadow-md transition-all group flex items-center justify-between">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Brain className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900 group-hover:text-indigo-600 transition-colors">
                                        {quiz.title}
                                    </h3>
                                    <p className="text-gray-500 text-sm line-clamp-1 mb-2">
                                        {quiz.description || "No description provided."}
                                    </p>
                                    <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {new Date(quiz.created_at).toLocaleDateString()}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <RefreshCw className="w-3 h-3" /> {quiz.question_count} Questions
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => startQuiz(quiz.id)}
                                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-colors flex items-center gap-2"
                            >
                                Start Quiz <PlayCircle className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
