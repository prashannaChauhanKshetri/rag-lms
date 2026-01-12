import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2, BookOpen, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import type { Chatbot } from '../../types';
import { cn } from '../../lib/utils';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: Array<{
        source: string;
        text: string;
        page?: string;
    }>;
}

interface ChatInterfaceProps {
    courseId?: string;
    onNavigate: (tabId: string) => void;
}

export function ChatInterface({ courseId }: ChatInterfaceProps) {
    const [courses, setCourses] = useState<Chatbot[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<Chatbot | null>(null);

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch courses on mount to allow selection if no courseId provided
    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const data = await api.get<{ chatbots: Chatbot[] }>('/chatbots/list');
                setCourses(data.chatbots);

                if (courseId) {
                    const course = data.chatbots.find(c => c.id === courseId);
                    if (course) setSelectedCourse(course);
                } else if (data.chatbots.length > 0) {
                    // Default to first course if none selected
                    setSelectedCourse(data.chatbots[0]);
                }
            } catch (err) {
                console.error("Failed to load courses", err);
            }
        };
        fetchCourses();
    }, [courseId]);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !selectedCourse) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const response = await api.post<{ response: string; sources: Array<{ source: string; text: string; page?: string }> }>(
                `/chatbots/${selectedCourse.id}/chat`,
                { message: userMsg, top_k: 5 }
            );

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.response,
                sources: response.sources
            }]);
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "I'm sorry, I encountered an error. Please try again."
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!selectedCourse && courses.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-green-600 mb-4" />
                <p className="text-gray-500">Loading your AI Assistant...</p>
            </div>
        );
    }

    return (
        <div className="flex h-full gap-6 max-w-7xl mx-auto animate-in fade-in duration-500">
            {/* Sidebar List of Courses (Desktop) */}
            <div className="hidden lg:flex flex-col w-64 bg-white rounded-2xl border border-gray-200 overflow-hidden h-[calc(100vh-140px)]">
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        Select Course
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {courses.map(course => (
                        <button
                            key={course.id}
                            onClick={() => {
                                setSelectedCourse(course);
                                setMessages([]); // Clear chat on switch? Or keep history? clearing for now.
                            }}
                            className={cn(
                                "w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-between group",
                                selectedCourse?.id === course.id
                                    ? "bg-green-50 text-green-700"
                                    : "text-gray-600 hover:bg-gray-50"
                            )}
                        >
                            <span className="truncate">{course.name}</span>
                            {selectedCourse?.id === course.id && <ChevronRight className="w-4 h-4" />}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm h-[calc(100vh-140px)] overflow-hidden">
                {/* Chat Header */}
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <div>
                        <h2 className="font-bold text-gray-800 flex items-center gap-2">
                            <Bot className="w-5 h-5 text-green-600" />
                            {selectedCourse?.name || "Select a Course"}
                        </h2>
                        <p className="text-xs text-gray-500">AI Tutor based on course materials</p>
                    </div>
                    {/* Mobile Course Selector could go here */}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/30">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-4">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                                <Bot className="w-8 h-8 text-green-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-800">How can I help you today?</h3>
                                <p className="text-sm max-w-md mx-auto mt-1">
                                    Ask me anything about <span className="font-medium text-gray-900">{selectedCourse?.name || "your course"}</span>.
                                    I can explain concepts, summarize topics, or help you study.
                                </p>
                            </div>
                        </div>
                    ) : (
                        messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    "flex gap-4 max-w-3xl",
                                    msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                                )}
                            >
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                                    msg.role === 'user' ? "bg-gray-200" : "bg-green-100 text-green-600"
                                )}>
                                    {msg.role === 'user' ? <User className="w-5 h-5 text-gray-500" /> : <Bot className="w-5 h-5" />}
                                </div>

                                <div className={cn(
                                    "rounded-2xl p-4 shadow-sm text-sm leading-relaxed",
                                    msg.role === 'user'
                                        ? "bg-gray-900 text-white rounded-tr-sm"
                                        : "bg-white border border-gray-100 rounded-tl-sm text-gray-800"
                                )}>
                                    <p className="whitespace-pre-wrap">{msg.content}</p>

                                    {/* Sources */}
                                    {msg.sources && msg.sources.length > 0 && (
                                        <div className="mt-4 pt-4 border-t border-gray-100">
                                            <p className="text-xs font-semibold text-gray-500 mb-2">Sources:</p>
                                            <div className="grid gap-2">
                                                {msg.sources.map((source, sIdx) => (
                                                    <div key={sIdx} className="text-xs bg-gray-50 p-2 rounded border border-gray-200">
                                                        <span className="font-medium text-green-700 block truncate">
                                                            {source.source} {source.page && `(Pg. ${source.page})`}
                                                        </span>
                                                        <span className="text-gray-500 line-clamp-1 italic">
                                                            "{source.text.substring(0, 100)}..."
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-100">
                    <form onSubmit={handleSend} className="relative max-w-4xl mx-auto">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={selectedCourse ? `Ask about ${selectedCourse.name}...` : "Select a course first..."}
                            disabled={isLoading || !selectedCourse}
                            className="w-full pl-4 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim() || !selectedCourse}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:hover:bg-green-500 transition-colors"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
