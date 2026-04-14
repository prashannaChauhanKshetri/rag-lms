import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { getUserSettings } from '../../lib/settings';

interface Notification {
    id: string;
    type: string;
    title: string;
    body?: string;
    is_read: boolean;
    created_at: string;
}

function timeAgo(isoStr: string): string {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_COLORS: Record<string, string> = {
    gradePublished: 'bg-green-500',
    assignments: 'bg-blue-500',
    quizAlerts: 'bg-purple-500',
    attendanceAlerts: 'bg-amber-500',
    newSubmission: 'bg-indigo-500',
    lateSubmission: 'bg-red-500',
    newTeacher: 'bg-teal-500',
    newStudent: 'bg-cyan-500',
    default: 'bg-gray-400',
};

const TYPE_TO_TAB: Record<string, Record<string, string>> = {
    student: {
        assignments: 'assignment-manager',
        gradePublished: 'assignment-manager',
        quizAlerts: 'quiz',
        attendanceAlerts: 'home',
    },
    instructor: {
        newSubmission: 'quiz-review',
        lateSubmission: 'quiz-review',
        assignments: 'assignments',
        newTeacher: 'home',
        newStudent: 'home',
    },
    admin: {},
    super_admin: {},
};

interface NotificationBellProps {
    userRole?: string;
    onNavigate?: (tab: string) => void;
}

export function NotificationBell({ userRole = 'student', onNavigate }: NotificationBellProps) {
    const [open, setOpen] = useState(false);
    const [count, setCount] = useState(0);
    const [items, setItems] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    // Enabled notification types from user settings
    const [enabledTypes, setEnabledTypes] = useState<Set<string> | null>(null);

    // Load notification preferences once on mount
    useEffect(() => {
        const loadPrefs = async () => {
            try {
                const settings = await getUserSettings();
                const prefs = settings.notifications as Record<string, boolean> | undefined;
                if (prefs) {
                    const enabled = new Set<string>();
                    if (prefs.gradePublished !== false) enabled.add('gradePublished');
                    if (prefs.assignments !== false) enabled.add('assignments');
                    if (prefs.quizAlerts !== false) enabled.add('quizAlerts');
                    if (prefs.attendanceAlerts !== false) enabled.add('attendanceAlerts');
                    if (prefs.systemUpdates !== false) enabled.add('systemUpdates');
                    // instructor types (always enabled unless explicitly off)
                    if (prefs.newSubmission !== false) enabled.add('newSubmission');
                    if (prefs.lateSubmission !== false) enabled.add('lateSubmission');
                    if (prefs.newTeacher !== false) enabled.add('newTeacher');
                    if (prefs.newStudent !== false) enabled.add('newStudent');
                    setEnabledTypes(enabled);
                }
            } catch {
                // ignore, show all if prefs can't load
            }
        };
        void loadPrefs();
    }, []);

    const isEnabled = useCallback((type: string) => {
        if (!enabledTypes) return true; // prefs not loaded yet — show all
        return enabledTypes.has(type);
    }, [enabledTypes]);

    const fetchCount = useCallback(async () => {
        try {
            const data = await api.get('/notifications/unread-count') as { count: number };
            setCount(data.count ?? 0);
        } catch {
            // Silent — don't break the UI if this fails
        }
    }, []);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.get('/notifications?limit=50') as { notifications: Notification[] };
            const all = data.notifications ?? [];
            setItems(all);
            setCount(all.filter(n => !n.is_read).length);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Poll for count every 60s. Use a ref to hold the interval ID so cleanup
    // is always tied to the exact ID created by this mount — avoids duplicate
    // intervals from React Strict Mode double-invoke in development.
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        void fetchCount();
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => { void fetchCount(); }, 60000);
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // run once on mount — fetchCount is stable (empty useCallback deps)

    // Open dropdown → fetch full list
    useEffect(() => {
        if (open) void fetchNotifications();
    }, [open, fetchNotifications]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const markAllRead = async () => {
        try {
            await api.patch('/notifications/read', {});
            setItems(prev => prev.map(n => ({ ...n, is_read: true })));
            setCount(0);
        } catch {
            // ignore
        }
    };

    const markOneRead = async (id: string) => {
        try {
            await api.patch('/notifications/read', { notification_ids: [id] });
            setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setCount(prev => Math.max(0, prev - 1));
        } catch {
            // ignore
        }
    };

    const handleNotificationClick = (n: Notification) => {
        if (!n.is_read) void markOneRead(n.id);
        const tabMap = TYPE_TO_TAB[userRole] ?? {};
        const tab = tabMap[n.type];
        if (tab && onNavigate) {
            setOpen(false);
            onNavigate(tab);
        }
    };

    const dotColor = TYPE_COLORS;

    // Visible notifications filtered by user preferences
    const visibleItems = items.filter(n => isEnabled(n.type));
    const visibleUnread = visibleItems.filter(n => !n.is_read).length;

    return (
        <div ref={dropdownRef} className="relative">
            {/* Bell button */}
            <button
                onClick={() => setOpen(prev => !prev)}
                className="relative p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors"
                aria-label="Notifications"
            >
                <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                {(count > 0 || visibleUnread > 0) && (
                    <span className="absolute top-1.5 right-1.5 min-w-[8px] h-2 w-2 bg-red-500 rounded-full border border-white dark:border-gray-900" />
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute top-full mt-2 right-0 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-50">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">Notifications</span>
                        {visibleUnread > 0 && (
                            <button
                                onClick={() => { void markAllRead(); }}
                                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                <CheckCheck className="w-3.5 h-3.5" />
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* Body */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                        {loading ? (
                            <div className="p-6 text-center text-sm text-gray-400">Loading...</div>
                        ) : visibleItems.length === 0 ? (
                            <div className="p-6 text-center">
                                <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                                <p className="text-sm text-gray-400 dark:text-gray-500">You're all caught up!</p>
                            </div>
                        ) : (
                            visibleItems.map(n => (
                                <div
                                    key={n.id}
                                    onClick={() => handleNotificationClick(n)}
                                    className={`flex gap-3 px-4 py-3 transition-colors cursor-pointer ${n.is_read ? 'opacity-60 hover:bg-gray-50 dark:hover:bg-gray-800/50' : 'bg-blue-50/40 dark:bg-blue-900/10 hover:bg-blue-100/60 dark:hover:bg-blue-900/20'}`}
                                >
                                    <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${(dotColor[n.type] ?? dotColor.default)}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-snug">{n.title}</p>
                                        {n.body && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                                        )}
                                        <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1">{timeAgo(n.created_at)}</p>
                                    </div>
                                    {!n.is_read && (
                                        <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
