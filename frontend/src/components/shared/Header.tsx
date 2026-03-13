import { useState, useEffect, useRef } from 'react';
import { Bell, Search, LogOut, Settings, User, Building2 } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import { ProfileModal } from './ProfileModal';

interface HeaderProps {
    userName: string;
    userRole: string;
    institutionName: string;
    userEmail?: string;
    userId?: string;
    userDisplayId?: string;
    onLogout?: () => void;
    canEditProfile?: boolean;
    onSettingsClick?: () => void;
}

export function Header({
    userName,
    userRole,
    institutionName,
    userEmail = '',
    userId = '',
    userDisplayId = '',
    onLogout,
    canEditProfile = false,
    onSettingsClick,
}: HeaderProps) {
    const [showProfile, setShowProfile] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const initial = (userName || '?').charAt(0).toUpperCase();

    // Close dropdown on outside click — no blocking backdrop needed
    useEffect(() => {
        if (!showDropdown) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showDropdown]);

    return (
        <>
            <header className="h-20 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-8 flex items-center justify-between sticky top-0 z-30">
                {/* Left: welcome text */}
                <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                        Welcome back, {userName.split(' ')[0]}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {institutionName || 'Gyana Learning'}
                    </p>
                </div>

                {/* Right: controls */}
                <div className="flex items-center gap-4">
                    {/* Search */}
                    <div className="relative hidden md:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search courses, assignments..."
                            className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none w-64 dark:text-white dark:placeholder-gray-400"
                        />
                    </div>

                    <ThemeToggle />

                    {/* Bell */}
                    <button className="relative p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors">
                        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
                    </button>

                    <div className="h-8 w-[1px] bg-gray-200 dark:bg-gray-700" />

                    {/* Avatar + dropdown — ref wraps both trigger and panel */}
                    <div ref={dropdownRef} className="relative">
                        {/* Trigger button */}
                        <button
                            onClick={() => setShowDropdown(prev => !prev)}
                            className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl px-2 py-1 transition-colors"
                        >
                            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-green-500/20 flex-shrink-0">
                                {initial}
                            </div>
                            <div className="hidden md:block text-left">
                                <p className="text-sm font-semibold text-gray-700 dark:text-white leading-none">{userName}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 capitalize">{userRole.replace('_', ' ')}</p>
                                {userEmail && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[140px]">{userEmail}</p>
                                )}
                            </div>
                        </button>

                        {/* Dropdown panel — no backdrop, closed via useEffect outside-click */}
                        {showDropdown && (
                            <div
                                className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden"
                                style={{ zIndex: 9999 }}
                            >
                                {/* Profile card */}
                                <div className="px-5 py-4 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10 border-b border-gray-100 dark:border-gray-800">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg flex-shrink-0">
                                            {initial}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-gray-900 dark:text-white text-sm">{userName}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{userEmail}</p>
                                            <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400 capitalize">
                                                {userRole.replace('_', ' ')}
                                            </span>
                                        </div>
                                    </div>
                                    {(userDisplayId || institutionName) && (
                                        <div className="mt-3 space-y-1">
                                            {userDisplayId && (
                                                <p className="text-xs font-mono text-gray-400 dark:text-gray-500">ID: #{userDisplayId}</p>
                                            )}
                                            {institutionName && (
                                                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                                    <Building2 className="w-3 h-3 flex-shrink-0" />
                                                    <span className="truncate">{institutionName}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Action buttons */}
                                <div className="p-2">
                                    {onSettingsClick && (
                                        <button
                                            type="button"
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors text-left"
                                            onClick={() => {
                                                setShowDropdown(false);
                                                onSettingsClick();
                                            }}
                                        >
                                            <Settings className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                            <div>
                                                <p className="font-semibold">Settings</p>
                                                <p className="text-xs text-gray-400 mt-0.5">Profile, security, preferences</p>
                                            </div>
                                        </button>
                                    )}
                                    {canEditProfile && (
                                        <button
                                            type="button"
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors text-left"
                                            onClick={() => {
                                                setShowDropdown(false);
                                                setShowProfile(true);
                                            }}
                                        >
                                            <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                            <div>
                                                <p className="font-semibold">View Profile</p>
                                                <p className="text-xs text-gray-400 mt-0.5">See your full profile details</p>
                                            </div>
                                        </button>
                                    )}
                                </div>

                                {/* Logout */}
                                {onLogout && (
                                    <div className="px-2 pb-2 border-t border-gray-100 dark:border-gray-800 pt-2">
                                        <button
                                            type="button"
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors text-left"
                                            onClick={() => {
                                                setShowDropdown(false);
                                                onLogout();
                                            }}
                                        >
                                            <LogOut className="w-4 h-4 flex-shrink-0" />
                                            <p className="font-semibold">Log Out</p>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Standalone logout (when no dropdown needed) */}
                    {onLogout && !onSettingsClick && !canEditProfile && (
                        <>
                            <div className="h-8 w-[1px] bg-gray-200 dark:bg-gray-700" />
                            <button
                                onClick={onLogout}
                                className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                title="Log out"
                                aria-label="Log out"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </>
                    )}
                </div>
            </header>

            {/* Profile Modal */}
            <ProfileModal
                isOpen={showProfile}
                onClose={() => setShowProfile(false)}
                canEdit={canEditProfile}
                user={{
                    id: userId,
                    display_id: userDisplayId || undefined,
                    username: userName,
                    full_name: userName,
                    email: userEmail,
                    role: userRole,
                    institution: institutionName,
                }}
            />
        </>
    );
}
