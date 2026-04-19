import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { Header } from './Header';

export interface ShellTab {
    id: string;
    label: string;
    icon: LucideIcon;
}

export interface ShellUser {
    id: string;
    full_name: string;
    role: string;
    email: string;
    institution?: string;
    institution_name?: string;
}

interface RoleShellProps {
    user: ShellUser;
    tabs: ShellTab[];
    activeTab: string;
    onTabChange: (id: string) => void;
    onNavigate?: (tab: string) => void;
    onSettingsClick: () => void;
    onLogout: () => void;
    children: ReactNode;
    /** Hide sidebar/mobile nav for pages that render their own chrome (e.g. SuperAdmin settings). */
    hideNav?: boolean;
}

/**
 * Unified layout for authenticated users. Sidebar + Header + scrollable main + MobileNav.
 * Consolidates what used to be three near-identical shells inside App.tsx.
 */
export function RoleShell({
    user,
    tabs,
    activeTab,
    onTabChange,
    onNavigate,
    onSettingsClick,
    onLogout,
    children,
    hideNav = false,
}: RoleShellProps) {
    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden transition-colors duration-200">
            {!hideNav && (
                <Sidebar activeTab={activeTab} onTabChange={onTabChange} tabs={tabs} />
            )}

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <Header
                    userName={user.full_name}
                    userRole={user.role}
                    institutionName={user.institution_name || user.institution || 'Gyana Learning'}
                    userEmail={user.email}
                    userId={user.id}
                    canEditProfile
                    onSettingsClick={onSettingsClick}
                    onNavigate={onNavigate}
                    onLogout={onLogout}
                />

                <div className="flex-1 overflow-y-auto p-4 lg:p-8 pb-24 lg:pb-8">
                    {children}
                </div>
            </main>

            {!hideNav && (
                <MobileNav tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
            )}
        </div>
    );
}
