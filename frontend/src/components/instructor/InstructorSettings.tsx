import { useState } from 'react';
import {
    User,
    Lock,
    Bell,
    Palette,
    GraduationCap,
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
    ClipboardList,
} from 'lucide-react';
import { api } from '../../lib/api';

type SectionId = 'profile' | 'security' | 'teaching' | 'notifications' | 'appearance' | 'danger';

interface InstructorSettingsProps {
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
    { id: 'teaching', label: 'Teaching Preferences', icon: GraduationCap },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'danger', label: 'Danger Zone', icon: Trash2, danger: true },
];

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
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${enabled ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
    );
}

function ProfileSection({ user }: { user: InstructorSettingsProps['user'] }) {
    const [fullName, setFullName] = useState(user.full_name);
    const [email, setEmail] = useState(user.email);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSave = async () => {
        setSaving(true); setMsg(null);
        try {
            await api.put('/auth/profile', { full_name: fullName, email });
            setMsg({ type: 'success', text: 'Profile updated successfully.' });
        } catch (err: unknown) {
            const e = err as Error;
            setMsg({ type: 'error', text: e.message || 'Failed to update profile.' });
        } finally { setSaving(false); }
    };

    return (
        <SectionCard title="Profile" subtitle="Your instructor profile information">
            {msg && <Alert type={msg.type} message={msg.text} />}
            <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-500/20">
                    {(user.full_name || user.username).charAt(0).toUpperCase()}
                </div>
                <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{user.full_name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">@{user.username}</p>
                    <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">Instructor</span>
                </div>
            </div>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Username</label>
                    <p className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-500 dark:text-gray-400 font-mono">{user.username}</p>
                    <p className="text-xs text-gray-400 mt-1">Username cannot be changed.</p>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Full Name</label>
                    <input value={fullName} onChange={e => setFullName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                </div>
                {user.institution_name && (
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Institution</label>
                        <p className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-500 dark:text-gray-400">{user.institution_name}</p>
                    </div>
                )}
            </div>
            <button onClick={handleSave} disabled={saving} className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60">
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
        setSaving(true); setMsg(null);
        try {
            await api.put('/auth/change-password', { current_password: current, new_password: newPw, confirm_password: confirm });
            setMsg({ type: 'success', text: 'Password changed successfully.' });
            setCurrent(''); setNewPw(''); setConfirm('');
        } catch (err: unknown) {
            const e = err as Error;
            setMsg({ type: 'error', text: e.message || 'Failed to change password.' });
        } finally { setSaving(false); }
    };

    return (
        <SectionCard title="Account Security" subtitle="Update your login password">
            {msg && <Alert type={msg.type} message={msg.text} />}
            <div className="space-y-4">
                {/* Current Password */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Current Password</label>
                    <div className="relative">
                        <input type={showCurrent ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)} className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                        <button type="button" onClick={() => setShowCurrent(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                {/* New Password */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">New Password</label>
                    <div className="relative">
                        <input type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                        <button type="button" onClick={() => setShowNew(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
                {/* Confirm Password */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Confirm New Password</label>
                    <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                </div>
            </div>
            <button onClick={handleSave} disabled={saving || !current || !newPw || !confirm} className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Update Password
            </button>
        </SectionCard>
    );
}

function TeachingPreferencesSection() {
    const [gradeDisplay, setGradeDisplay] = useState<'percentage' | 'letter' | 'points'>('percentage');
    const [defaultDueTime, setDefaultDueTime] = useState('23:59');
    const [autoPublish, setAutoPublish] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

    return (
        <SectionCard title="Teaching Preferences" subtitle="Defaults for your classes and grading">
            <div className="space-y-5">
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Grade Display Format</label>
                    <div className="flex gap-3">
                        {(['percentage', 'letter', 'points'] as const).map(opt => (
                            <button key={opt} onClick={() => setGradeDisplay(opt)} className={`flex-1 py-2 rounded-xl border text-sm font-semibold capitalize transition-all ${gradeDisplay === opt ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}>
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Default Assignment Due Time</label>
                    <input type="time" value={defaultDueTime} onChange={e => setDefaultDueTime(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                </div>
                <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-gray-800">
                    <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Auto-publish Quiz Results</p>
                        <p className="text-xs text-gray-500">Automatically publish quiz scores after submission</p>
                    </div>
                    <button onClick={() => setAutoPublish(p => !p)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoPublish ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoPublish ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>
            <button onClick={handleSave} className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
                {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? 'Saved!' : 'Save Preferences'}
            </button>
        </SectionCard>
    );
}

function NotificationsSection() {
    const [prefs, setPrefs] = useState({ newSubmission: true, lateSubmission: true, attendanceReminder: true, quizCompleted: false, systemUpdates: true });
    const set = (k: keyof typeof prefs) => (v: boolean) => setPrefs(p => ({ ...p, [k]: v }));
    return (
        <SectionCard title="Notifications" subtitle="Control which events notify you">
            <Toggle enabled={prefs.newSubmission} onChange={set('newSubmission')} label="New Submission" description="When a student submits an assignment" />
            <Toggle enabled={prefs.lateSubmission} onChange={set('lateSubmission')} label="Late Submission" description="When a student submits after the deadline" />
            <Toggle enabled={prefs.attendanceReminder} onChange={set('attendanceReminder')} label="Attendance Reminder" description="Daily reminder to mark attendance" />
            <Toggle enabled={prefs.quizCompleted} onChange={set('quizCompleted')} label="Quiz Completed" description="When all students have completed a quiz" />
            <Toggle enabled={prefs.systemUpdates} onChange={set('systemUpdates')} label="System Updates" description="Platform announcements and maintenance" />
        </SectionCard>
    );
}

function AppearanceSection() {
    const isDark = document.documentElement.classList.contains('dark');
    const [dark, setDark] = useState(isDark);
    const toggle = (v: boolean) => { setDark(v); document.documentElement.classList.toggle('dark', v); localStorage.setItem('theme', v ? 'dark' : 'light'); };
    return (
        <SectionCard title="Appearance" subtitle="Customize the platform look">
            <div className="flex gap-4">
                <button onClick={() => toggle(false)} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${!dark ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                    <Sun className={`w-6 h-6 ${!dark ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className={`text-sm font-semibold ${!dark ? 'text-blue-700' : 'text-gray-500'}`}>Light</span>
                </button>
                <button onClick={() => toggle(true)} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${dark ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                    <Moon className={`w-6 h-6 ${dark ? 'text-blue-400' : 'text-gray-400'}`} />
                    <span className={`text-sm font-semibold ${dark ? 'text-blue-400' : 'text-gray-500'}`}>Dark</span>
                </button>
            </div>
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
        setLoading(true); setMsg(null);
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
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">This will permanently remove your account and all class data</p>
                    </div>
                    <button onClick={() => setShowConfirm(true)} className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-300 dark:border-red-700 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">Delete Account</button>
                </div>
            ) : (
                <div className="space-y-4">
                    {msg && <Alert type={msg.type} message={msg.text} />}
                    <p className="text-sm text-red-600 dark:text-red-400 font-semibold">Enter your password to confirm:</p>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full px-3 py-2 border border-red-300 dark:border-red-800 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition" />
                    <div className="flex gap-3">
                        <button onClick={() => { setShowConfirm(false); setPassword(''); setMsg(null); }} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
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

export function InstructorSettings({ user, onLogout }: InstructorSettingsProps) {
    const [active, setActive] = useState<SectionId>('profile');

    const renderSection = () => {
        switch (active) {
            case 'profile': return <ProfileSection user={user} />;
            case 'security': return <SecuritySection />;
            case 'teaching': return <TeachingPreferencesSection />;
            case 'notifications': return <NotificationsSection />;
            case 'appearance': return <AppearanceSection />;
            case 'danger': return <DangerZoneSection onLogout={onLogout} />;
        }
    };

    return (
        <div className="w-full">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Manage your instructor account preferences</p>
            </div>
            <div className="flex gap-6 items-start">
                <nav className="w-56 flex-shrink-0 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-2 sticky top-4">
                    {NAV_ITEMS.map(({ id, label, icon: Icon, danger }) => (
                        <button key={id} onClick={() => setActive(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active === id ? danger ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            {label}
                            {active === id && <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
                        </button>
                    ))}
                </nav>
                <div className="flex-1 min-w-0">{renderSection()}</div>
            </div>
        </div>
    );
}
