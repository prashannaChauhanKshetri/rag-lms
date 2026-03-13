import { useState } from 'react';
import {
    User,
    Lock,
    Bell,
    Palette,
    Server,
    Building2,
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
    Info,
    ToggleLeft,
} from 'lucide-react';
import { api } from '../../lib/api';

type SectionId = 'profile' | 'security' | 'platform' | 'institutions' | 'notifications' | 'appearance' | 'danger';

interface SuperAdminSettingsProps {
    user: {
        id: string;
        username: string;
        full_name: string;
        email: string;
        role: string;
    };
    onLogout: () => void;
}

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType; danger?: boolean }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Account Security', icon: Lock },
    { id: 'platform', label: 'Platform Config', icon: Server },
    { id: 'institutions', label: 'Institution Mgmt', icon: Building2 },
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
            <button onClick={() => onChange(!enabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 ${enabled ? 'bg-rose-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
    );
}

function ProfileSection({ user }: { user: SuperAdminSettingsProps['user'] }) {
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
        <SectionCard title="Profile" subtitle="Your super admin account details">
            {msg && <Alert type={msg.type} message={msg.text} />}
            <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-rose-500/20">
                    {(user.full_name || user.username).charAt(0).toUpperCase()}
                </div>
                <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{user.full_name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">@{user.username}</p>
                    <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-400">Super Admin</span>
                </div>
            </div>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Username</label>
                    <p className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-500 font-mono">{user.username}</p>
                    <p className="text-xs text-gray-400 mt-1">Username cannot be changed.</p>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Full Name</label>
                    <input value={fullName} onChange={e => setFullName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-500 transition" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Email Address</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-500 transition" />
                </div>
            </div>
            <button onClick={handleSave} disabled={saving} className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60">
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
        <SectionCard title="Account Security" subtitle="Change your super admin password">
            {msg && <Alert type={msg.type} message={msg.text} />}
            <div className="space-y-4">
                {[{ label: 'Current Password', value: current, onChange: setCurrent, show: showCurrent, onToggle: () => setShowCurrent(p => !p) }, { label: 'New Password', value: newPw, onChange: setNewPw, show: showNew, onToggle: () => setShowNew(p => !p) }].map(({ label, value, onChange, show, onToggle }) => (
                    <div key={label}>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
                        <div className="relative">
                            <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 transition" />
                            <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                        </div>
                    </div>
                ))}
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Confirm New Password</label>
                    <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 transition" />
                </div>
            </div>
            <button onClick={handleSave} disabled={saving || !current || !newPw || !confirm} className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Update Password
            </button>
        </SectionCard>
    );
}

function PlatformConfigSection() {
    const [platformName, setPlatformName] = useState('Gyana Learning');
    const [maxInstitutions, setMaxInstitutions] = useState('100');
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [registrationOpen, setRegistrationOpen] = useState(true);
    const [saved, setSaved] = useState(false);
    const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

    return (
        <SectionCard title="Platform Configuration" subtitle="Global platform settings">
            <div className="space-y-5">
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> Platform Name</label>
                    <input value={platformName} onChange={e => setPlatformName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-rose-500 transition" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Max Institutions Allowed</label>
                    <input type="number" value={maxInstitutions} onChange={e => setMaxInstitutions(e.target.value)} min="1" className="w-32 px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 transition" />
                </div>
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-0">
                    <Toggle enabled={registrationOpen} onChange={setRegistrationOpen} label="Open Registration" description="Allow new users to sign up on the platform" />
                    <div className="flex items-center justify-between py-3">
                        <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                <ToggleLeft className="w-4 h-4 text-orange-500" />
                                Maintenance Mode
                            </p>
                            <p className="text-xs text-gray-500">Temporarily disable access for all non-super-admin users</p>
                        </div>
                        <button onClick={() => setMaintenanceMode(p => !p)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${maintenanceMode ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${maintenanceMode ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                </div>
                {maintenanceMode && (
                    <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 flex items-start gap-2">
                        <Info className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-orange-700 dark:text-orange-400">Maintenance mode is ON. Only super admins can access the platform.</p>
                    </div>
                )}
            </div>
            <button onClick={handleSave} className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-colors">
                {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {saved ? 'Saved!' : 'Save Configuration'}
            </button>
        </SectionCard>
    );
}

function InstitutionMgmtSection() {
    const stats = [
        { label: 'Total Institutions', value: '—', icon: Building2 },
        { label: 'Active Institutions', value: '—', icon: CheckCircle },
        { label: 'API Version', value: 'v1.0', icon: Server },
    ];
    return (
        <SectionCard title="Institution Management" subtitle="Platform-wide institution overview">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                {stats.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <Icon className="w-5 h-5 text-rose-500 mb-2" />
                        <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                    </div>
                ))}
            </div>
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 flex items-start gap-2">
                <Info className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 dark:text-rose-400">Live institution data is managed through the Super Admin Dashboard. This panel shows a summary overview.</p>
            </div>
        </SectionCard>
    );
}

function NotificationsSection() {
    const [prefs, setPrefs] = useState({ newInstitution: true, adminAlerts: true, apiErrors: true, usageReports: false });
    const set = (k: keyof typeof prefs) => (v: boolean) => setPrefs(p => ({ ...p, [k]: v }));
    return (
        <SectionCard title="Notifications" subtitle="System-level notification preferences">
            <Toggle enabled={prefs.newInstitution} onChange={set('newInstitution')} label="New Institution Registered" description="When a new institution joins the platform" />
            <Toggle enabled={prefs.adminAlerts} onChange={set('adminAlerts')} label="Admin Account Alerts" description="Admin account creation and removal events" />
            <Toggle enabled={prefs.apiErrors} onChange={set('apiErrors')} label="Critical API Errors" description="Platform-wide API failures and alerts" />
            <Toggle enabled={prefs.usageReports} onChange={set('usageReports')} label="Weekly Usage Reports" description="Platform usage statistics delivered weekly" />
        </SectionCard>
    );
}

function AppearanceSection() {
    const isDark = document.documentElement.classList.contains('dark');
    const [dark, setDark] = useState(isDark);
    const toggle = (v: boolean) => { setDark(v); document.documentElement.classList.toggle('dark', v); localStorage.setItem('theme', v ? 'dark' : 'light'); };
    return (
        <SectionCard title="Appearance" subtitle="Customize your view">
            <div className="flex gap-4">
                <button onClick={() => toggle(false)} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${!dark ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                    <Sun className={`w-6 h-6 ${!dark ? 'text-rose-600' : 'text-gray-400'}`} />
                    <span className={`text-sm font-semibold ${!dark ? 'text-rose-700' : 'text-gray-500'}`}>Light</span>
                </button>
                <button onClick={() => toggle(true)} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${dark ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                    <Moon className={`w-6 h-6 ${dark ? 'text-rose-400' : 'text-gray-400'}`} />
                    <span className={`text-sm font-semibold ${dark ? 'text-rose-400' : 'text-gray-500'}`}>Dark</span>
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
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Irreversible actions. Proceed with extreme caution.</p>
            </div>
            {!showConfirm ? (
                <div className="flex items-center justify-between p-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10">
                    <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Delete Super Admin Account</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">This removes only your account. Platform data and all institutions are preserved.</p>
                    </div>
                    <button onClick={() => setShowConfirm(true)} className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-300 dark:border-red-700 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">Delete Account</button>
                </div>
            ) : (
                <div className="space-y-4">
                    {msg && <Alert type={msg.type} message={msg.text} />}
                    <p className="text-sm text-red-600 dark:text-red-400 font-semibold">Enter your password to confirm deletion:</p>
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

export function SuperAdminSettings({ user, onLogout }: SuperAdminSettingsProps) {
    const [active, setActive] = useState<SectionId>('profile');

    const renderSection = () => {
        switch (active) {
            case 'profile': return <ProfileSection user={user} />;
            case 'security': return <SecuritySection />;
            case 'platform': return <PlatformConfigSection />;
            case 'institutions': return <InstitutionMgmtSection />;
            case 'notifications': return <NotificationsSection />;
            case 'appearance': return <AppearanceSection />;
            case 'danger': return <DangerZoneSection onLogout={onLogout} />;
        }
    };

    return (
        <div className="w-full">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Manage your super admin account and platform configuration</p>
            </div>
            <div className="flex gap-6 items-start">
                <nav className="w-56 flex-shrink-0 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-2 sticky top-4">
                    {NAV_ITEMS.map(({ id, label, icon: Icon, danger }) => (
                        <button key={id} onClick={() => setActive(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active === id ? danger ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400' : danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
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
