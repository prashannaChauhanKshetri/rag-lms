import { useState } from 'react';
import { Bell, Search, LogOut } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import { ProfileModal } from './ProfileModal';

interface HeaderProps {
    userName: string;
    userRole: string;
    institutionName: string;
    userEmail?: string;
    userId?: string;
    onLogout?: () => void;
    canEditProfile?: boolean;
}

export function Header({
    userName,
    userRole,
    institutionName,
    userEmail = '',
    userId = '',
    onLogout,
    canEditProfile = false,
}: HeaderProps) {
    const [showProfile, setShowProfile] = useState(false);

    return (
        <>
            <header className="h-20 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-8 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Welcome back, {userName.split(' ')[0]}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {institutionName || 'Gyana Learning'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="relative hidden md:block">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                            <Search className="w-4 h-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search courses, assignments..."
                            className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none w-64 dark:text-white dark:placeholder-gray-400"
                        />
                    </div>

                    <ThemeToggle />

                    <button className="relative p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full transition-colors">
                        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                    </button>

                    <div className="h-8 w-[1px] bg-gray-200 dark:bg-gray-700"></div>

                    {/* Clickable avatar → opens profile modal */}
                    <button
                        onClick={() => setShowProfile(true)}
                        className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl px-2 py-1 transition-colors"
                        title="View profile"
                    >
                        <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-green-500/20 flex-shrink-0">
                            {userName.charAt(0).toUpperCase()}
                        </div>
                        <div className="hidden md:block text-left">
                            <p className="text-sm font-semibold text-gray-700 dark:text-white leading-none">{userName}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 capitalize">{userRole}</p>
                        </div>
                    </button>

                    {onLogout && (
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
