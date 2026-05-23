import { lazy, Suspense, useEffect, useState } from 'react';
import {
    User,
    Lock,
    Bell,
    Palette,
    Shield,
    Trash2,
    ChevronRight,
    Save,
    Loader2,
    CheckCircle,
    AlertCircle,
    Eye,
    EyeOff,
    Sun,
    Moon,
    FileSpreadsheet,
    BookOpen,
    ClipboardList,
    CalendarCheck,
    TrendingUp,
    Type,
} from 'lucide-react';
import { api } from '../../lib/api';

const PrivacyCharts = lazy(() => import('./PrivacyCharts'));
import {
    getExportData,
    exportMyDataAsCSV,
    getUserSettings,
    updateUserSettings,
    type ExportData,
} from '../../lib/settings';
import { useTheme } from '../../contexts/ThemeContext';

type SectionId = 'profile' | 'security' | 'notifications' | 'appearance' | 'privacy' | 'danger';

interface StudentSettingsProps {
    user: {
        id: string;
        username: string;
        full_name: string;
        email: string;
        role: string;
        institution_name?: string;
    };
    onLogout: () => void;
}

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType; danger?: boolean }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Account Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'privacy', label: 'Privacy & Data', icon: Shield },
    { id: 'danger', label: 'Danger Zone', icon: Trash2, danger: true },
];

/* ─── Tiny helpers ─────────────────────────────────────────────────────────── */

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <div className="mb-5">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
                {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            {children}
        </div>
    );
}

function Alert({ type, message }: { type: 'success' | 'error'; message: string }) {
    return (
        <div className={`flex items-center gap-2 p-3 rounded-xl text-sm mb-4 ${type === 'success' ? 'bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'}`}>
            {type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {message}
        </div>
    );
}

function Toggle({ enabled, onChange, label, description }: { enabled: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
    return (
        <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
            <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</p>
                {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
            </div>
            <button
                onClick={() => onChange(!enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${enabled ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
    );
}

/* ─── Sections ─────────────────────────────────────────────────────────────── */

function ProfileSection({ user }: { user: StudentSettingsProps['user'] }) {
    const [fullName, setFullName] = useState(user.full_name);
    const [email, setEmail] = useState(user.email);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            await api.put('/auth/profile', { full_name: fullName, email });
            setMsg({ type: 'success', text: 'Profile updated successfully.' });
        } catch (err: unknown) {
            const e = err as Error;
            setMsg({ type: 'error', text: e.message || 'Failed to update profile.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <SectionCard title="Profile" subtitle="Manage your personal information">
            {msg && <Alert type={msg.type} message={msg.text} />}

            <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-green-500/20">
                    {(user.full_name || user.username).charAt(0).toUpperCase()}
                </div>
                <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{user.full_name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">@{user.username}</p>
                    <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">Student</span>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> Username
                    </label>
                    <p className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-500 dark:text-gray-400 font-mono">{user.username}</p>
                    <p className="text-xs text-gray-400 mt-1">Username cannot be changed.</p>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> Full Name
                    </label>
                    <input value={fullName} onChange={e => setFullName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 transition" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 transition" />
                </div>
            </div>

            <button
                onClick={handleSave}
                disabled={saving}
                className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
            >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
            </button>
        </SectionCard>
    );
}

function SecuritySection() {
    const [current, setCurrent] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSave = async () => {
        if (newPw !== confirm) { setMsg({ type: 'error', text: 'New passwords do not match.' }); return; }
        setSaving(true);
        setMsg(null);
        try {
            await api.put('/auth/change-password', { current_password: current, new_password: newPw, confirm_password: confirm });
            setMsg({ type: 'success', text: 'Password changed successfully.' });
            setCurrent(''); setNewPw(''); setConfirm('');
        } catch (err: unknown) {
            const e = err as Error;
            setMsg({ type: 'error', text: e.message || 'Failed to change password.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <SectionCard title="Account Security" subtitle="Update your password and security settings">
            {msg && <Alert type={msg.type} message={msg.text} />}
            <div className="space-y-4">
                {/* Current Password */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Current Password</label>
                    <div className="relative">
                        <input
                            type={showCurrent ? 'text' : 'password'}
                            value={current}
                            onChange={e => setCurrent(e.target.value)}
                            className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                        />
                        <button type="button" onClick={() => setShowCurrent(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* New Password */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">New Password</label>
                    <div className="relative">
                        <input
                            type={showNew ? 'text' : 'password'}
                            value={newPw}
                            onChange={e => setNewPw(e.target.value)}
                            className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                        />
                        <button type="button" onClick={() => setShowNew(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Confirm Password */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Confirm New Password</label>
                    <input
                        type="password"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                    />
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500">Min 8 characters, at least one uppercase letter and one number.</p>
            </div>
            <button
                onClick={handleSave}
                disabled={saving || !current || !newPw || !confirm}
                className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
            >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Update Password
            </button>
        </SectionCard>
    );
}


function NotificationsSection() {
    const [prefs, setPrefs] = useState({
        assignments: true,
        quizAlerts: true,
        gradePublished: true,
        attendanceAlerts: false,
        systemUpdates: true,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const loadSettings = async () => {
            setLoading(true);
            try {
                const settings = await getUserSettings();
                const incoming = settings.notifications;
                if (incoming) {
                    setPrefs(prev => ({
                        ...prev,
                        assignments: incoming.assignments ?? prev.assignments,
                        quizAlerts: incoming.quizAlerts ?? prev.quizAlerts,
                        gradePublished: incoming.gradePublished ?? prev.gradePublished,
                        attendanceAlerts: incoming.attendanceAlerts ?? prev.attendanceAlerts,
                        systemUpdates: incoming.systemUpdates ?? prev.systemUpdates,
                    }));
                }
            } catch (err: unknown) {
                const e = err as Error;
                setMsg({ type: 'error', text: e.message || 'Failed to load notification preferences.' });
            } finally {
                setLoading(false);
            }
        };

        void loadSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            await updateUserSettings({ notifications: prefs });
            setMsg({ type: 'success', text: 'Notification preferences saved.' });
        } catch (err: unknown) {
            const e = err as Error;
            setMsg({ type: 'error', text: e.message || 'Failed to save notification preferences.' });
        } finally {
            setSaving(false);
        }
    };

    const set = (key: keyof typeof prefs) => (v: boolean) => setPrefs(p => ({ ...p, [key]: v }));

    return (
        <SectionCard title="Notifications" subtitle="Choose what you want to be notified about">
            {msg && <Alert type={msg.type} message={msg.text} />}
            <Toggle enabled={prefs.assignments} onChange={set('assignments')} label="Assignment Reminders" description="Get notified before assignment deadlines" />
            <Toggle enabled={prefs.quizAlerts} onChange={set('quizAlerts')} label="Quiz Alerts" description="Notifications for upcoming quizzes" />
            <Toggle enabled={prefs.gradePublished} onChange={set('gradePublished')} label="Grades Published" description="Notify when an instructor posts your grade" />
            <Toggle enabled={prefs.attendanceAlerts} onChange={set('attendanceAlerts')} label="Attendance Alerts" description="Warnings when attendance drops below threshold" />
            <Toggle enabled={prefs.systemUpdates} onChange={set('systemUpdates')} label="System Updates" description="Platform maintenance and announcements" />
            <button
                onClick={handleSave}
                disabled={saving || loading}
                className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
            >
                {saving || loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Preferences
            </button>
        </SectionCard>
    );
}

function AppearanceSection() {
    const { isDark, setDarkMode, fontSize, setFontSize, reduceMotion, setReduceMotion, highContrast, setHighContrast } = useTheme();

    const persist = async (patch: Record<string, unknown>) => {
        try {
            await updateUserSettings({ appearance: patch as Parameters<typeof updateUserSettings>[0]['appearance'] });
        } catch { /* applied locally; ignore persistence failures */ }
    };

    const handleTheme = (dark: boolean) => {
        setDarkMode(dark);
        void persist({ theme: dark ? 'dark' : 'light', fontSize, reduceMotion, highContrast });
    };

    const FONT_SIZES = [
        { value: 'small' as const, label: 'Small', sample: 'text-xs' },
        { value: 'medium' as const, label: 'Medium', sample: 'text-sm' },
        { value: 'large' as const, label: 'Large', sample: 'text-base' },
    ];

    return (
        <SectionCard title="Appearance & Accessibility" subtitle="Customize how the platform looks and behaves">
            {/* Theme */}
            <div className="mb-6">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Sun className="w-3.5 h-3.5" /> Theme
                </p>
                <div className="flex gap-3">
                    <button onClick={() => handleTheme(false)} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${!isDark ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                        <Sun className={`w-5 h-5 ${!isDark ? 'text-green-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-semibold ${!isDark ? 'text-green-700 dark:text-green-400' : 'text-gray-500'}`}>Light</span>
                    </button>
                    <button onClick={() => handleTheme(true)} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${isDark ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                        <Moon className={`w-5 h-5 ${isDark ? 'text-green-500' : 'text-gray-400'}`} />
                        <span className={`text-sm font-semibold ${isDark ? 'text-green-400' : 'text-gray-500'}`}>Dark</span>
                    </button>
                </div>
            </div>

            {/* Text Size */}
            <div className="mb-6">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5" /> Text Size
                </p>
                <div className="flex gap-3">
                    {FONT_SIZES.map(({ value, label, sample }) => (
                        <button
                            key={value}
                            onClick={() => { setFontSize(value); void persist({ theme: isDark ? 'dark' : 'light', fontSize: value, reduceMotion, highContrast }); }}
                            className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all ${fontSize === value ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                        >
                            <span className={`font-bold ${sample} ${fontSize === value ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>A</span>
                            <span className={`text-xs font-medium ${fontSize === value ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>{label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Toggles */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Accessibility</p>
                <Toggle
                    enabled={reduceMotion}
                    onChange={(v) => { setReduceMotion(v); void persist({ theme: isDark ? 'dark' : 'light', fontSize, reduceMotion: v, highContrast }); }}
                    label="Reduce Motion"
                    description="Disables animations and transitions"
                />
                <Toggle
                    enabled={highContrast}
                    onChange={(v) => { setHighContrast(v); void persist({ theme: isDark ? 'dark' : 'light', fontSize, reduceMotion, highContrast: v }); }}
                    label="High Contrast"
                    description="Increases visual contrast for easier reading"
                />
            </div>
        </SectionCard>
    );
}

type DataTab = 'quiz' | 'assignments' | 'attendance';

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
    return (
        <div className={`rounded-2xl p-4 border ${color} flex items-center gap-3`}>
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/60 dark:bg-black/20 flex items-center justify-center">
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="text-xs font-medium opacity-70">{label}</p>
                <p className="text-xl font-bold">{value}</p>
            </div>
        </div>
    );
}

function PrivacySection() {
    const [loadingPreview, setLoadingPreview] = useState(true);
    const [loadingCSV, setLoadingCSV] = useState(false);
    const [exportData, setExportData] = useState<ExportData | null>(null);
    const [activeTab, setActiveTab] = useState<DataTab>('quiz');
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoadingPreview(true);
            try {
                const data = await getExportData();
                setExportData(data);
            } catch (err: unknown) {
                const e = err as Error;
                setMsg({ type: 'error', text: e.message || 'Failed to load data preview.' });
            } finally {
                setLoadingPreview(false);
            }
        };
        void load();
    }, []);

    const handleCSVDownload = async () => {
        setLoadingCSV(true);
        setMsg(null);
        try {
            await exportMyDataAsCSV();
            setMsg({ type: 'success', text: 'CSV export downloaded successfully.' });
        } catch (err: unknown) {
            const e = err as Error;
            setMsg({ type: 'error', text: e.message || 'Failed to export data.' });
        } finally {
            setLoadingCSV(false);
        }
    };

    const summary = exportData?.academics.summary;
    const breakdown = exportData?.academics.attendance.by_status;

    const donutData = breakdown ? [
        { name: 'Present', value: breakdown.present },
        { name: 'Absent', value: breakdown.absent },
        { name: 'Late', value: breakdown.late },
        { name: 'Excused', value: breakdown.excused },
    ].filter(d => d.value > 0) : [];

    const averagesData = summary ? [
        { label: 'Quiz Avg', value: summary.quiz_average_score ?? 5, hasData: summary.quiz_average_score != null },
        { label: 'Assignment Avg', value: summary.assignment_average_score ?? 5, hasData: summary.assignment_average_score != null },
    ] : [];

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            present: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400',
            absent: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
            late: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400',
            excused: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400',
        };
        return (
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        );
    };

    return (
        <SectionCard title="Privacy & Data" subtitle="Preview your academic data and download a copy">
            {msg && <Alert type={msg.type} message={msg.text} />}

            {/* Loading skeleton */}
            {loadingPreview && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                    <p className="text-sm text-gray-500">Loading your data preview…</p>
                </div>
            )}

            {!loadingPreview && exportData && (
                <>
                    {/* ── Stat Cards ── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                        <StatCard
                            icon={BookOpen}
                            label="Quiz Attempts"
                            value={summary?.quiz_attempts ?? 0}
                            color="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300"
                        />
                        <StatCard
                            icon={ClipboardList}
                            label="Assignments"
                            value={summary?.assignment_submissions ?? 0}
                            color="border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300"
                        />
                        <StatCard
                            icon={CalendarCheck}
                            label="Attendance Records"
                            value={summary?.attendance_records ?? 0}
                            color="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                        />
                        <StatCard
                            icon={TrendingUp}
                            label="Attendance Rate"
                            value={summary?.attendance_rate_percent != null ? `${summary.attendance_rate_percent}%` : 'N/A'}
                            color="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
                        />
                    </div>

                    {/* ── Charts Row ── lazy-loaded to keep recharts out of the main bundle */}
                    <Suspense fallback={
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="h-[228px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 animate-pulse" />
                            <div className="h-[228px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 animate-pulse" />
                        </div>
                    }>
                        <PrivacyCharts donutData={donutData} averagesData={averagesData} />
                    </Suspense>

                    {/* ── Tabs ── */}
                    <div className="mb-2">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Detailed Records</p>
                        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
                            {(['quiz', 'assignments', 'attendance'] as DataTab[]).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                        activeTab === tab
                                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                    }`}
                                >
                                    {tab === 'quiz' ? 'Quiz Results' : tab === 'assignments' ? 'Assignments' : 'Attendance'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 mb-6">
                        {activeTab === 'quiz' && (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 w-10">#</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Quiz ID</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Score</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Submitted At</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {exportData.academics.quiz_results.records.length === 0 ? (
                                        <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">No quiz attempts yet</td></tr>
                                    ) : exportData.academics.quiz_results.records.map((r, i) => (
                                        <tr key={r.id} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}>
                                            <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                                            <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 font-mono text-xs">{r.quiz_id.slice(0, 12)}…</td>
                                            <td className="px-4 py-2.5">
                                                {r.score != null ? (
                                                    <span className={`font-semibold ${
                                                        r.score >= 80 ? 'text-green-600 dark:text-green-400' :
                                                        r.score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                                                    }`}>{r.score}</span>
                                                ) : <span className="text-gray-400">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-gray-500 text-xs">{new Date(r.submitted_at).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {activeTab === 'assignments' && (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 w-10">#</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Assignment ID</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Score</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Feedback</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Submitted At</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {exportData.academics.assignment_results.records.length === 0 ? (
                                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No assignment submissions yet</td></tr>
                                    ) : exportData.academics.assignment_results.records.map((r, i) => (
                                        <tr key={r.id} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}>
                                            <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                                            <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 font-mono text-xs">{r.assignment_id.slice(0, 12)}…</td>
                                            <td className="px-4 py-2.5">
                                                {r.score != null ? (
                                                    <span className={`font-semibold ${
                                                        r.score >= 80 ? 'text-green-600 dark:text-green-400' :
                                                        r.score >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                                                    }`}>{r.score}</span>
                                                ) : <span className="text-gray-400">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[160px] truncate">{r.feedback ?? '—'}</td>
                                            <td className="px-4 py-2.5 text-gray-500 text-xs">{new Date(r.submitted_at).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {activeTab === 'attendance' && (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 w-10">#</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Section ID</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Date</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Status</th>
                                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {exportData.academics.attendance.records.length === 0 ? (
                                        <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No attendance records found</td></tr>
                                    ) : exportData.academics.attendance.records.map((r, i) => (
                                        <tr key={r.id} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}>
                                            <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                                            <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 font-mono text-xs">{r.section_id.slice(0, 12)}…</td>
                                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 text-xs">{r.date}</td>
                                            <td className="px-4 py-2.5">{statusBadge(r.status)}</td>
                                            <td className="px-4 py-2.5 text-gray-500 text-xs">{r.notes ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* ── Download Button ── */}
                    <button
                        onClick={() => { void handleCSVDownload(); }}
                        disabled={loadingCSV}
                        className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold text-sm shadow-md shadow-green-500/20 hover:shadow-green-500/30 transition-all disabled:opacity-60 group"
                    >
                        {loadingCSV ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <FileSpreadsheet className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        )}
                        {loadingCSV ? 'Generating CSV…' : 'Download My Data as CSV'}
                        {!loadingCSV && (
                            <span className="text-xs font-normal opacity-80 ml-1">(Profile · Quizzes · Assignments · Attendance)</span>
                        )}
                    </button>
                </>
            )}
        </SectionCard>
    );
}

function DangerZoneSection({ onLogout }: { onLogout: () => void }) {
    const [showConfirm, setShowConfirm] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleDelete = async () => {
        if (!password) { setMsg({ type: 'error', text: 'Please enter your password to confirm.' }); return; }
        setLoading(true);
        setMsg(null);
        try {
            await api.delete('/auth/account', { body: JSON.stringify({ password }), headers: { 'Content-Type': 'application/json' } } as RequestInit & { token?: string });
            setMsg({ type: 'success', text: 'Account deleted. Logging out...' });
            setTimeout(onLogout, 1500);
        } catch (err: unknown) {
            const e = err as Error;
            setMsg({ type: 'error', text: e.message || 'Failed to delete account.' });
            setLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border-2 border-red-200 dark:border-red-900/50 p-6">
            <div className="mb-5">
                <h2 className="text-lg font-bold text-red-600 dark:text-red-400">Danger Zone</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Irreversible actions. Proceed with caution.</p>
            </div>

            {!showConfirm ? (
                <div className="flex items-center justify-between p-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10">
                    <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Delete Account</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Permanently delete your account and all data</p>
                    </div>
                    <button onClick={() => setShowConfirm(true)} className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-300 dark:border-red-700 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                        Delete Account
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {msg && <Alert type={msg.type} message={msg.text} />}
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                        <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Are you absolutely sure?</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">This action cannot be undone. Type your password to confirm account deletion.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Confirm Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" className="w-full px-3 py-2 border border-red-300 dark:border-red-800 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition" />
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => { setShowConfirm(false); setPassword(''); setMsg(null); }} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleDelete} disabled={loading || !password} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Delete My Account
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Main Component ────────────────────────────────────────────────────────── */

export function StudentSettings({ user, onLogout }: StudentSettingsProps) {
    const [active, setActive] = useState<SectionId>('profile');

    const renderSection = () => {
        switch (active) {
            case 'profile': return <ProfileSection user={user} />;
            case 'security': return <SecuritySection />;
            case 'notifications': return <NotificationsSection />;
            case 'appearance': return <AppearanceSection />;
            case 'privacy': return <PrivacySection />;
            case 'danger': return <DangerZoneSection onLogout={onLogout} />;
        }
    };

    return (
        <div className="w-full">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Manage your account preferences</p>
            </div>
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-start">
                {/* Left Nav — horizontal scroll on mobile, vertical sidebar on desktop */}
                <nav className="lg:w-56 lg:flex-shrink-0 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-2 lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
                    {NAV_ITEMS.map(({ id, label, icon: Icon, danger }) => (
                        <button
                            key={id}
                            onClick={() => setActive(id)}
                            className={`flex-shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${active === id
                                ? danger
                                    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                    : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                : danger
                                    ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                        >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            {label}
                            {active === id && <ChevronRight className="w-3.5 h-3.5 ml-auto hidden lg:block" />}
                        </button>
                    ))}
                </nav>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {renderSection()}
                </div>
            </div>
        </div>
    );
}
