import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Chatbot } from '../../types';
import { Loader2, RefreshCcw, Smile } from 'lucide-react';

interface Flashcard {
    id: string;
    front: string;
    back: string;
}

export function StudentFlashcards() {
    const [courses, setCourses] = useState<Chatbot[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState('');
    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());

    useEffect(() => {
        api.get<{ chatbots: Chatbot[] }>('/chatbots/list')
            .then(data => {
                setCourses(data.chatbots);
                if (data.chatbots.length > 0) {
                    setSelectedCourseId(data.chatbots[0].id);
                }
            })
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        if (!selectedCourseId) return;
        setIsLoading(true);
        api.get<{ flashcards: Flashcard[] }>(`/student/flashcards/${selectedCourseId}`)
            .then(res => {
                setFlashcards(res.flashcards);
                setFlippedCards(new Set()); // Reset flips
            })
            .catch(err => console.error(err))
            .finally(() => setIsLoading(false));
    }, [selectedCourseId]);

    const toggleFlip = (id: string) => {
        const newFlipped = new Set(flippedCards);
        if (newFlipped.has(id)) {
            newFlipped.delete(id);
        } else {
            newFlipped.add(id);
        }
        setFlippedCards(newFlipped);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Study Flashcards</h1>
                    <p className="text-gray-500 mt-1">Master your course concepts with interactive cards</p>
                </div>

                <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="px-4 py-2 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-green-500 outline-none text-gray-700 font-medium"
                >
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            {isLoading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                </div>
            ) : flashcards.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-3xl border border-gray-100 shadow-sm">
                    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Smile className="h-10 w-10 text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">No flashcards yet!</h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                        Your instructor hasn't published any flashcards for this course yet. Check back later!
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {flashcards.map((card) => (
                        <div
                            key={card.id}
                            onClick={() => toggleFlip(card.id)}
                            className="perspective-1000 h-64 cursor-pointer group"
                        >
                            <div className={`relative w-full h-full duration-500 preserve-3d transition-transform ${flippedCards.has(card.id) ? 'rotate-y-180' : ''}`}>
                                {/* Front */}
                                <div className="absolute w-full h-full backface-hidden bg-white p-8 rounded-3xl border border-gray-200 shadow-sm group-hover:shadow-md transition-shadow flex flex-col items-center justify-center text-center">
                                    <span className="inline-block px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs font-bold tracking-wide mb-4">
                                        QUESTION
                                    </span>
                                    <p className="text-lg font-bold text-gray-800 leading-relaxed line-clamp-4">
                                        {card.front}
                                    </p>
                                    <p className="absolute bottom-6 text-xs text-gray-400 font-medium flex items-center gap-1">
                                        <RefreshCcw className="w-3 h-3" /> Click to flip
                                    </p>
                                </div>

                                {/* Back */}
                                <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-gradient-to-br from-green-500 to-emerald-600 p-8 rounded-3xl shadow-lg flex flex-col items-center justify-center text-center text-white">
                                    <span className="inline-block px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold tracking-wide mb-4">
                                        ANSWER
                                    </span>
                                    <p className="text-lg font-medium leading-relaxed overflow-y-auto max-h-[140px] custom-scrollbar">
                                        {card.back}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
