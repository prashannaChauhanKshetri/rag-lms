import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Send, User, Bot, Loader2, BookOpen, ChevronRight, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../lib/api';
import type { Chatbot } from '../../types';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Select } from '../ui/Select';

const LAST_COURSE_KEY = 'chat:lastCourseId';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: Array<{
        source: string;
        text: string;
        page?: string;
    }>;
    fromHistory?: boolean;
}

interface HistoryRow {
    id: string;
    question: string;
    answer: string;
    timestamp: string;
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
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Load courses ──────────────────────────────────────────────────────────
    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const data = await api.get<{ chatbots: Chatbot[] }>('/chatbots/list');
                setCourses(data.chatbots);
                const remembered = typeof window !== 'undefined' ? localStorage.getItem(LAST_COURSE_KEY) : null;
                const preferredId = courseId || remembered;
                const preferred = preferredId ? data.chatbots.find(c => c.id === preferredId) : null;
                if (preferred) {
                    setSelectedCourse(preferred);
                } else if (data.chatbots.length > 0) {
                    setSelectedCourse(data.chatbots[0]);
                }
            } catch (err) {
                console.error('Failed to load courses', err);
            }
        };
        fetchCourses();
    }, [courseId]);

    // Persist selected course so refresh keeps the user in context.
    useEffect(() => {
        if (selectedCourse?.id) {
            localStorage.setItem(LAST_COURSE_KEY, selectedCourse.id);
        }
    }, [selectedCourse?.id]);

    // ── Load persistent conversation history when course changes ─────────────
    useEffect(() => {
        if (!selectedCourse) return;
        setMessages([]);
        setIsLoadingHistory(true);

        api.get<{ history: HistoryRow[] }>(`/chatbots/${selectedCourse.id}/history?limit=30`)
            .then(({ history }) => {
                if (!history || history.length === 0) return;
                // History comes newest-first from API — reverse to oldest-first for display
                const sorted = [...history].reverse();
                const hydrated: Message[] = sorted.flatMap(row => [
                    { role: 'user' as const, content: row.question, fromHistory: true },
                    { role: 'assistant' as const, content: row.answer, fromHistory: true },
                ]);
                setMessages(hydrated);
            })
            .catch(() => {/* history unavailable — start fresh */})
            .finally(() => setIsLoadingHistory(false));
    }, [selectedCourse?.id]);

    // ── Auto-scroll ───────────────────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-grow textarea to fit content (cap at 5 lines ≈ 140px).
    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, [input]);

    // ── Send message ──────────────────────────────────────────────────────────
    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || !selectedCourse || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const response = await api.post<{
                response: string;
                sources: Array<{ source: string; text: string; page?: string }>;
                cached?: boolean;
            }>(
                `/chatbots/${selectedCourse.id}/chat`,
                { message: userMsg, top_k: 5 }
            );

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.response,
                sources: response.sources,
            }]);
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "I'm sorry, I encountered an error. Please try again.",
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Clear Redis memory (start fresh context, keep DB history) ────────────
    const handleNewChat = async () => {
        if (!selectedCourse) return;
        try {
            await api.delete(`/chatbots/${selectedCourse.id}/memory`);
        } catch {/* best-effort */}
        setMessages([]);
    };

    // ── Switch course ─────────────────────────────────────────────────────────
    const handleCourseSwitch = (course: Chatbot) => {
        setSelectedCourse(course);
        // messages are cleared and reloaded by the useEffect above
    };

    if (!selectedCourse && courses.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-green-600 mb-4" />
                <p className="text-muted-foreground">Loading your AI Assistant...</p>
            </div>
        );
    }

    return (
        <div className="flex h-full gap-6 max-w-7xl mx-auto animate-in fade-in duration-500">
            {/* ── Course sidebar ── */}
            <Card className="hidden lg:flex flex-col w-64 overflow-hidden h-[calc(100vh-140px)]" elevated>
                <div className="p-4 border-b border-border bg-muted/50">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        Select Course
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {courses.map(course => (
                        <button
                            key={course.id}
                            onClick={() => handleCourseSwitch(course)}
                            className={cn(
                                "w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-between group",
                                selectedCourse?.id === course.id
                                    ? "bg-green-50 text-green-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : "text-muted-foreground hover:bg-muted"
                            )}
                        >
                            <span className="truncate">{course.name}</span>
                            {selectedCourse?.id === course.id && <ChevronRight className="w-4 h-4" />}
                        </button>
                    ))}
                </div>
            </Card>

            {/* ── Chat area ── */}
            <Card className="flex-1 flex flex-col h-[calc(100vh-140px)] overflow-hidden" elevated>
                {/* Header */}
                <div className="p-4 border-b border-border bg-muted/50 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="font-bold text-foreground flex items-center gap-2">
                            <Bot className="w-5 h-5 text-green-600" />
                            {selectedCourse?.name || 'Select a Course'}
                        </h2>
                        <p className="text-xs text-muted-foreground">AI Tutor based on course materials</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Mobile course selector */}
                        <div className="lg:hidden w-36">
                            <Select
                                value={selectedCourse?.id || ''}
                                onChange={(e) => {
                                    const next = courses.find(c => c.id === e.target.value) || null;
                                    if (next) handleCourseSwitch(next);
                                }}
                                className="h-9"
                            >
                                {courses.map(course => (
                                    <option key={course.id} value={course.id}>{course.name}</option>
                                ))}
                            </Select>
                        </div>
                        {/* New Chat */}
                        <button
                            onClick={handleNewChat}
                            title="Start new conversation (clears AI memory, history is preserved)"
                            className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-muted/20">
                    {isLoadingHistory ? (
                        <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">Loading conversation history…</span>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-4">
                            <div className="w-16 h-16 bg-green-100 dark:bg-emerald-950/40 rounded-full flex items-center justify-center">
                                <Bot className="w-8 h-8 text-green-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">How can I help you today?</h3>
                                <p className="text-sm max-w-md mx-auto mt-1">
                                    Ask me anything about{' '}
                                    <span className="font-medium text-foreground">
                                        {selectedCourse?.name || 'your course'}
                                    </span>.
                                    I can explain concepts, summarise topics, or help you study.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* History divider — show when loaded history exists */}
                            {messages.some(m => m.fromHistory) && (
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <div className="flex-1 h-px bg-border" />
                                    <span className="shrink-0 px-2">Previous conversations</span>
                                    <div className="flex-1 h-px bg-border" />
                                </div>
                            )}

                            {messages.map((msg, idx) => {
                                // Show divider before first non-history message
                                const isFirstNew = !msg.fromHistory && idx > 0 && messages[idx - 1]?.fromHistory;
                                return (
                                    <div key={idx}>
                                        {isFirstNew && (
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground my-4">
                                                <div className="flex-1 h-px bg-border" />
                                                <span className="shrink-0 px-2">This session</span>
                                                <div className="flex-1 h-px bg-border" />
                                            </div>
                                        )}
                                        <div
                                            className={cn(
                                                "flex gap-4 max-w-3xl",
                                                msg.role === 'user' ? "ml-auto flex-row-reverse" : "",
                                                msg.fromHistory ? "opacity-70" : ""
                                            )}
                                        >
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                                                msg.role === 'user'
                                                    ? "bg-muted"
                                                    : "bg-green-100 text-green-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                                            )}>
                                                {msg.role === 'user'
                                                    ? <User className="w-5 h-5 text-muted-foreground" />
                                                    : <Bot className="w-5 h-5" />}
                                            </div>

                                            <div className={cn(
                                                "rounded-2xl p-4 shadow-sm text-sm leading-relaxed",
                                                msg.role === 'user'
                                                    ? "bg-gray-900 text-white rounded-tr-sm"
                                                    : "bg-card border border-border rounded-tl-sm text-foreground"
                                            )}>
                                                {msg.role === 'user' ? (
                                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                                ) : (
                                                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:mt-3 prose-headings:mb-1 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 prose-pre:my-2 prose-code:text-xs prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                                    </div>
                                                )}

                                                {msg.sources && msg.sources.length > 0 && !msg.fromHistory && (
                                                    <div className="mt-4 pt-4 border-t border-border">
                                                        <p className="text-xs font-semibold text-muted-foreground mb-2">Sources:</p>
                                                        <div className="grid gap-2">
                                                            {msg.sources.map((source, sIdx) => (
                                                                <div key={sIdx} className="text-xs bg-muted/50 p-2 rounded border border-border">
                                                                    <span className="font-medium text-green-700 dark:text-emerald-300 block truncate">
                                                                        {source.source} {source.page && `(Pg. ${source.page})`}
                                                                    </span>
                                                                    <span className="text-muted-foreground line-clamp-1 italic">
                                                                        "{source.text.substring(0, 100)}..."
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {isLoading && (
                                <div className="flex gap-4 max-w-3xl">
                                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0 mt-1">
                                        <Bot className="w-5 h-5 text-green-600" />
                                    </div>
                                    <div className="bg-card border border-border rounded-2xl rounded-tl-sm p-4">
                                        <div className="flex gap-1">
                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce [animation-delay:0ms]" />
                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce [animation-delay:150ms]" />
                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-bounce [animation-delay:300ms]" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 bg-card border-t border-border">
                    <form onSubmit={handleSend} className="relative max-w-4xl mx-auto">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            rows={1}
                            placeholder={selectedCourse ? `Ask about ${selectedCourse.name}…  (Shift+Enter for newline)` : 'Select a course first…'}
                            disabled={isLoading || !selectedCourse}
                            aria-label="Chat message"
                            className="w-full resize-none rounded-xl border border-border bg-card py-3 pl-4 pr-14 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 leading-6"
                            style={{ maxHeight: 140 }}
                        />
                        <Button
                            type="submit"
                            disabled={isLoading || !input.trim() || !selectedCourse}
                            size="sm"
                            aria-label="Send message"
                            className="absolute right-2 bottom-2 h-9 w-9 p-0 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:hover:bg-green-500"
                        >
                            {isLoading
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Send className="w-4 h-4" />}
                        </Button>
                    </form>
                </div>
            </Card>
        </div>
    );
}
