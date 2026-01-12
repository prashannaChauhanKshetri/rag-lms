import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Chatbot } from '../../types';
import {
    Loader2,
    BookOpen,
    RefreshCcw,
    Save,
    AlertCircle,
    Plus,
    Trash2,
    Check
} from 'lucide-react';

interface Flashcard {
    id?: string;
    front: string;
    back: string;
}

export function FlashcardManager() {
    const [courses, setCourses] = useState<Chatbot[]>([]);

    // State
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [activeMode, setActiveMode] = useState<'ai' | 'manual'>('ai');

    // AI Form
    const [topic, setTopic] = useState('');
    const [count, setCount] = useState(10);
    const [isGenerating, setIsGenerating] = useState(false);

    // Manual Form
    const [manualFront, setManualFront] = useState('');
    const [manualBack, setManualBack] = useState('');

    // Shared
    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    useEffect(() => {
        api.get<{ chatbots: Chatbot[] }>('/chatbots/list')
            .then(data => {
                setCourses(data.chatbots);
                if (data.chatbots.length > 0) setSelectedCourseId(data.chatbots[0].id);
            })
            .catch(err => console.error(err));
    }, []);

    const handleGenerateAI = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCourseId) return;
        setIsGenerating(true);
        setError(null);

        try {
            const res = await api.post<{ flashcards: Flashcard[] }>('/instructor/flashcards/generate', {
                chatbot_id: selectedCourseId,
                topic,
                count
            });
            // Append generated cards
            setFlashcards(prev => [...prev, ...res.flashcards]);
            setSuccessMsg(`Generated ${res.flashcards.length} cards!`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Generation failed");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAddManual = (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualFront || !manualBack) return;

        const newCard: Flashcard = {
            front: manualFront,
            back: manualBack
        };

        setFlashcards(prev => [...prev, newCard]);
        setManualFront('');
        setManualBack('');
    };

    const handleDelete = (idx: number) => {
        setFlashcards(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSaveAll = async () => {
        if (!selectedCourseId || flashcards.length === 0) return;

        try {
            await api.post('/instructor/flashcards/save', {
                chatbot_id: selectedCourseId,
                flashcards
            });
            setSuccessMsg("All flashcards saved and published!");
            setFlashcards([]); // Clear after save
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save");
        }
    };

    return (
        <div className="flex h-full gap-6">
            {/* Left Panel: Controls */}
            <div className="w-1/3 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full overflow-y-auto">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#10B981]" />
                    Flashcard Manager
                </h2>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Course</label>
                    <select
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#10B981] outline-none"
                    >
                        {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg mb-6">
                    <button
                        onClick={() => setActiveMode('ai')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeMode === 'ai' ? 'bg-white shadow text-[#10B981]' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        AI Generator
                    </button>
                    <button
                        onClick={() => setActiveMode('manual')}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeMode === 'manual' ? 'bg-white shadow text-[#10B981]' : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Manual Entry
                    </button>
                </div>

                {activeMode === 'ai' ? (
                    <form onSubmit={handleGenerateAI} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
                            <input
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="e.g. Key Definitions"
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#10B981] outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Count</label>
                            <input
                                type="number"
                                value={count}
                                onChange={(e) => setCount(parseInt(e.target.value))}
                                min={1} max={20}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#10B981] outline-none"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isGenerating}
                            className="w-full flex items-center justify-center gap-2 bg-[#10B981] text-white py-3 rounded-xl hover:bg-[#059669] transition-colors font-medium"
                        >
                            {isGenerating ? <Loader2 className="animate-spin w-5 h-5" /> : <RefreshCcw className="w-5 h-5" />}
                            Generate Cards
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleAddManual} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Front (Question/Term)</label>
                            <textarea
                                value={manualFront}
                                onChange={(e) => setManualFront(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#10B981] outline-none h-20"
                                placeholder="Enter term..."
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Back (Answer/Definition)</label>
                            <textarea
                                value={manualBack}
                                onChange={(e) => setManualBack(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#10B981] outline-none h-20"
                                placeholder="Enter definition..."
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 transition-colors font-medium"
                        >
                            <Plus className="w-5 h-5" />
                            Add Card
                        </button>
                    </form>
                )}

                {error && (
                    <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}
                {successMsg && (
                    <div className="mt-4 p-3 bg-green-50 text-green-600 rounded-lg text-sm flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        {successMsg}
                    </div>
                )}
            </div>

            {/* Right Panel: Preview */}
            <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                <div className="flex justify-between items-center mb-6 pb-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Preview Deck ({flashcards.length})</h2>
                    {flashcards.length > 0 && (
                        <button
                            onClick={handleSaveAll}
                            className="flex items-center gap-2 px-4 py-2 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors font-medium shadow-sm"
                        >
                            <Save className="w-4 h-4" />
                            Publish Deck
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
                    {flashcards.map((card, idx) => (
                        <div key={idx} className="relative group perspective-1000 h-48">
                            <div className="w-full h-full relative border rounded-xl shadow-sm bg-white p-4 flex flex-col justify-between hover:shadow-md transition-all">
                                <div>
                                    <div className="text-xs font-bold text-gray-400 uppercase mb-2">Front</div>
                                    <p className="font-medium text-gray-900 line-clamp-3">{card.front}</p>
                                </div>
                                <div className="border-t pt-2 mt-2">
                                    <div className="text-xs font-bold text-gray-400 uppercase mb-1">Back</div>
                                    <p className="text-sm text-gray-600 line-clamp-2">{card.back}</p>
                                </div>

                                <button
                                    onClick={() => handleDelete(idx)}
                                    className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                    {flashcards.length === 0 && (
                        <div className="col-span-full h-64 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                            <BookOpen className="w-12 h-12 mb-3 opacity-20" />
                            <p>No cards yet. Generator or add some!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
